import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildCodecRegistration,
  FIXED_CLOCK,
  CODEC_KIND_TRANSFORM,
  type CodecName,
  type CodecOperation,
  type CodecTransform,
  type CodecTransformArtifact,
} from '@nekotools/lens-codec';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoCodec UI parse helper, extracted out of CodecApp for testability —
 * the same engine-adapter seam NekoJSON's `parse-input.ts`, NekoEnv's
 * `env-parse.ts`, NekoLogs' `logs-parse.ts`, and NekoYAML's `yaml-parse.ts`
 * provide.
 *
 * `source.bytes` is the UTF-8 byte length (not `raw.length`, which counts
 * UTF-16 code units), matching what the engine's `codec.transform` parser
 * uses for its large-document threshold. The registry is a module singleton
 * so parser identity is stable across App re-renders.
 */

const SHARED_UTF8_ENCODER = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildCodecRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface CodecRun {
  /** The parsed transform, or null when the run emitted no artifact. */
  readonly transform: CodecTransform | null;
  /** Transformed output text; null when a decode failed. */
  readonly output: string | null;
  readonly ok: boolean;
  readonly looksBinary: boolean;
  /** JSON summary string from the engine exporter; null when no artifact. */
  readonly jsonSummary: string | null;
  /** Markdown summary string from the engine exporter; null when no artifact. */
  readonly markdownSummary: string | null;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
  readonly outputBytes: number;
}

/**
 * Run `codec.transform` over raw input with the chosen operation + codec
 * (passed as parser hints) and render the engine's JSON + Markdown summary
 * exporters. Output strings come from the real engine exporters (not
 * re-derived in the UI), so the tab can't drift from the engine's behavior.
 */
export function runCodec(raw: string, operation: CodecOperation, codec: CodecName): CodecRun {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'codec', 'codec.transform', {
    raw,
    source: { kind: 'paste', bytes },
    hints: { operation, codec },
  });

  const artifact = result.artifacts.find(
    (a): a is CodecTransformArtifact => a.kind === CODEC_KIND_TRANSFORM,
  );

  let jsonSummary: string | null = null;
  let markdownSummary: string | null = null;
  if (artifact !== undefined) {
    jsonSummary = String(
      runExporter(registry, 'codec', 'codec.export.summary.json', {
        artifacts: [artifact],
        diagnostics: result.diagnostics,
      }).body,
    );
    markdownSummary = String(
      runExporter(registry, 'codec', 'codec.export.summary.markdown', {
        artifacts: [artifact],
        diagnostics: result.diagnostics,
      }).body,
    );
  }

  const value = artifact?.value ?? null;
  return {
    transform: value,
    output: value?.output ?? null,
    ok: value?.ok ?? false,
    looksBinary: value?.looksBinary ?? false,
    jsonSummary,
    markdownSummary,
    diagnostics: result.diagnostics,
    inputBytes: bytes,
    outputBytes: value?.outputBytes ?? 0,
  };
}
