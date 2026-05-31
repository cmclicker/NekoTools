import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildUrlRegistration,
  FIXED_CLOCK,
  URL_KIND_PARSED,
  type UrlComponents,
  type UrlParsedArtifact,
} from '@nekotools/lens-url';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoURL UI parse helper, extracted out of UrlApp for testability — the
 * same engine-adapter seam NekoJSON's `parse-input.ts`, NekoEnv's
 * `env-parse.ts`, NekoLogs' `logs-parse.ts`, and NekoYAML's `yaml-parse.ts`
 * provide.
 *
 * `source.bytes` is the UTF-8 byte length (not `raw.length`, which counts
 * UTF-16 code units), matching what the engine's `url.text` parser uses
 * for its long-query threshold. The registry is a module singleton so
 * parser identity is stable across App re-renders.
 */

const SHARED_UTF8_ENCODER = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildUrlRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedUrlView {
  readonly valid: boolean;
  readonly components: UrlComponents | null;
  /** Normalized, credential-free URL (sorted query); null when invalid. */
  readonly normalized: string | null;
  /** Query params as a pretty JSON array; `"[]"` when none/invalid. */
  readonly paramsJson: string;
  /** Markdown summary of the parse (components + diagnostics). */
  readonly markdown: string;
  /** Pro: severity-ranked markdown security/hygiene audit, or null when not entitled. */
  readonly batchAudit: string | null;
  /** Pro: declarative JSON redaction preset, or null when not entitled. */
  readonly redactionPreset: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

/**
 * Run `url.text` over the raw input and render the engine's normalized,
 * params-JSON, and markdown exporters. Output strings come from the real
 * engine exporters (not re-derived in the UI), so the tab can't drift
 * from the engine's behavior. The Pro batch-audit + redaction-preset
 * exports are gated: `runExporter` throws EntitlementError for a free
 * caller, surfaced here as null so the UI shows the Pro-lock (same
 * pattern as hex-parse.ts).
 */
export function parseUrlInput(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedUrlView {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'url', 'url.text', {
    raw,
    source: { kind: 'paste', bytes },
  });

  const artifact = result.artifacts.find(
    (a): a is UrlParsedArtifact => a.kind === URL_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: [] };
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'url', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  const paramsJson = artifact
    ? String(runExporter(registry, 'url', 'url.export.params.json', exportInput).body)
    : '[]';
  const markdown = artifact
    ? String(runExporter(registry, 'url', 'url.export.markdown.summary', exportInput).body)
    : '';
  const normalizedRaw =
    artifact && value?.valid
      ? String(runExporter(registry, 'url', 'url.export.normalized', exportInput).body)
      : '';

  return {
    valid: value?.valid ?? false,
    components: value?.components ?? null,
    normalized: value?.valid ? normalizedRaw : null,
    paramsJson,
    markdown,
    batchAudit: runPro('url.export.batch.audit'),
    redactionPreset: runPro('url.export.redaction.preset'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}
