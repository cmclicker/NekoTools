import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildHashRegistration,
  digestBytes,
  utf8Encode,
  FIXED_CLOCK,
  HASH_KIND_INPUT,
  type HashAlgorithm,
  type HashDigest,
  type HashDigestArtifact,
  type HashDigestDeps,
  type HashInputArtifact,
} from '@nekotools/lens-hash';
import type { ArtifactSource, Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoHash UI parse helper, extracted out of HashApp for testability — the
 * same engine-adapter seam NekoJSON's `parse-input.ts` and NekoYAML's
 * `yaml-parse.ts` provide.
 *
 * Hashing is asynchronous (Web Crypto `crypto.subtle.digest`), so these
 * helpers return promises. Output strings (digest / JSON / Markdown) come
 * from the real engine exporters, not re-derived in the UI, so the tab
 * can't drift from the engine. The registry is a module singleton so the
 * parser identity is stable across App re-renders.
 *
 * The Pro exporters (`hash.export.manifest` + `hash.export.checksum.profile`)
 * are *synchronous* projections of the digest artifact the async engine
 * already produced — they never recompute a hash. They are gated:
 * `runExporter` throws EntitlementError for a free caller, surfaced here as
 * null so the UI shows the Pro-lock (same pattern as hex-parse.ts).
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildHashRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

const clock = FIXED_CLOCK(new Date().toISOString());

export interface HashRunnerDeps {
  /** Injectable Web Crypto digester, forwarded to the engine. UI tests
   * inject a deterministic implementation so they do not depend on the
   * test environment's crypto support. */
  readonly subtle?: HashDigestDeps['subtle'];
}

export interface ParsedHash {
  /** The computed digest, or null when no digest was produced. */
  readonly digest: HashDigest | null;
  readonly hex: string | null;
  readonly base64: string | null;
  readonly jsonSummary: string | null;
  readonly markdownSummary: string | null;
  /** Pro: a `sha256sum`-style checksum manifest, or null when not entitled. */
  readonly manifest: string | null;
  /** Pro: a JSON verification profile, or null when not entitled. */
  readonly checksumProfile: string | null;
  readonly proUnlocked: boolean;
  readonly inputBytes: number;
  readonly algorithm: HashAlgorithm;
  readonly diagnostics: readonly Diagnostic[];
}

function digestDepsOf(deps: HashRunnerDeps): HashDigestDeps {
  return deps.subtle !== undefined ? { clock, subtle: deps.subtle } : { clock };
}

function renderExports(
  artifact: HashDigestArtifact,
  diagnostics: readonly Diagnostic[],
  entitlement: Entitlement,
): {
  json: string;
  markdown: string;
  digest: string;
  manifest: string | null;
  checksumProfile: string | null;
} {
  // Pro exporters ship in the binary but `runExporter` throws EntitlementError
  // for a free caller; surface that as null so the UI shows the Pro-lock.
  // These are synchronous projections of the already-computed digest artifact
  // — no Web Crypto, no recomputation.
  const runPro = (id: string): string | null => {
    try {
      return String(
        runExporter(registry, 'hash', id, { artifacts: [artifact], diagnostics: [] }, entitlement)
          .body,
      );
    } catch {
      return null;
    }
  };
  return {
    json: String(
      runExporter(registry, 'hash', 'hash.export.json', { artifacts: [artifact], diagnostics: [] })
        .body,
    ),
    markdown: String(
      runExporter(registry, 'hash', 'hash.export.markdown.summary', {
        artifacts: [artifact],
        diagnostics,
      }).body,
    ),
    digest: String(
      runExporter(registry, 'hash', 'hash.export.digest', {
        artifacts: [artifact],
        diagnostics: [],
      }).body,
    ),
    manifest: runPro('hash.export.manifest'),
    checksumProfile: runPro('hash.export.checksum.profile'),
  };
}

function buildParsed(
  algorithm: HashAlgorithm,
  inputBytes: number,
  artifact: HashDigestArtifact | undefined,
  diagnostics: readonly Diagnostic[],
  entitlement: Entitlement,
): ParsedHash {
  const proUnlocked = entitlement.tier !== 'free';
  if (artifact === undefined) {
    return {
      digest: null,
      hex: null,
      base64: null,
      jsonSummary: null,
      markdownSummary: null,
      manifest: null,
      checksumProfile: null,
      proUnlocked,
      inputBytes,
      algorithm,
      diagnostics,
    };
  }
  const ex = renderExports(artifact, diagnostics, entitlement);
  return {
    digest: artifact.value,
    hex: artifact.value.hex,
    base64: artifact.value.base64,
    jsonSummary: ex.json,
    markdownSummary: ex.markdown,
    manifest: ex.manifest,
    checksumProfile: ex.checksumProfile,
    proUnlocked,
    inputBytes: artifact.value.inputBytes,
    algorithm,
    diagnostics,
  };
}

/** Ingest raw text (sync parser → `hash.input` + ingest diagnostics), then
 * compute the digest (async). The Pro exporters run synchronously on the
 * resulting digest artifact, gated by `entitlement`. */
export async function hashText(
  raw: string,
  algorithm: HashAlgorithm,
  deps: HashRunnerDeps = {},
  entitlement: Entitlement = FREE_ENTITLEMENT,
): Promise<ParsedHash> {
  const bytes = utf8Encode(raw);
  const parsed = runParser(registry, 'hash', 'hash.text', {
    raw,
    source: { kind: 'paste', bytes: bytes.byteLength },
  });
  const inputArtifact = parsed.artifacts.find(
    (a): a is HashInputArtifact => a.kind === HASH_KIND_INPUT,
  );
  const diagnostics: Diagnostic[] = [...parsed.diagnostics];

  const source: ArtifactSource =
    inputArtifact !== undefined
      ? { kind: 'derived', from: [inputArtifact.id] }
      : { kind: 'paste', bytes: bytes.byteLength };
  const result = await digestBytes(algorithm, bytes, digestDepsOf(deps), source);
  diagnostics.push(...result.diagnostics);

  return buildParsed(algorithm, bytes.byteLength, result.artifacts[0], diagnostics, entitlement);
}

/** Compute the digest of already-read file bytes (no text parse). The Pro
 * exporters run synchronously on the resulting digest artifact, gated by
 * `entitlement`. */
export async function hashBytes(
  bytes: Uint8Array,
  algorithm: HashAlgorithm,
  source: ArtifactSource,
  deps: HashRunnerDeps = {},
  entitlement: Entitlement = FREE_ENTITLEMENT,
): Promise<ParsedHash> {
  const result = await digestBytes(algorithm, bytes, digestDepsOf(deps), source);
  return buildParsed(
    algorithm,
    bytes.byteLength,
    result.artifacts[0],
    [...result.diagnostics],
    entitlement,
  );
}
