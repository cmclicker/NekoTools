import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
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
import type { ArtifactSource, Diagnostic } from '@nekotools/contracts';

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
): { json: string; markdown: string; digest: string } {
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
  };
}

function buildParsed(
  algorithm: HashAlgorithm,
  inputBytes: number,
  artifact: HashDigestArtifact | undefined,
  diagnostics: readonly Diagnostic[],
): ParsedHash {
  if (artifact === undefined) {
    return {
      digest: null,
      hex: null,
      base64: null,
      jsonSummary: null,
      markdownSummary: null,
      inputBytes,
      algorithm,
      diagnostics,
    };
  }
  const ex = renderExports(artifact, diagnostics);
  return {
    digest: artifact.value,
    hex: artifact.value.hex,
    base64: artifact.value.base64,
    jsonSummary: ex.json,
    markdownSummary: ex.markdown,
    inputBytes: artifact.value.inputBytes,
    algorithm,
    diagnostics,
  };
}

/** Ingest raw text (sync parser → `hash.input` + ingest diagnostics), then
 * compute the digest (async). */
export async function hashText(
  raw: string,
  algorithm: HashAlgorithm,
  deps: HashRunnerDeps = {},
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

  return buildParsed(algorithm, bytes.byteLength, result.artifacts[0], diagnostics);
}

/** Compute the digest of already-read file bytes (no text parse). */
export async function hashBytes(
  bytes: Uint8Array,
  algorithm: HashAlgorithm,
  source: ArtifactSource,
  deps: HashRunnerDeps = {},
): Promise<ParsedHash> {
  const result = await digestBytes(algorithm, bytes, digestDepsOf(deps), source);
  return buildParsed(algorithm, bytes.byteLength, result.artifacts[0], [...result.diagnostics]);
}
