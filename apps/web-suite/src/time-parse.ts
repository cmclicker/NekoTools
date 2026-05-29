import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildTimeRegistration,
  TIME_KIND_INSTANT,
  type TimeInstant,
  type TimeInstantArtifact,
} from '@nekotools/lens-time';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoTime UI parse helper, extracted out of TimeApp for testability —
 * the same engine-adapter seam NekoJSON's `parse-input.ts`, NekoEnv's
 * `env-parse.ts`, NekoLogs' `logs-parse.ts`, and NekoYAML's
 * `yaml-parse.ts` provide.
 *
 * The registry is a module singleton wired with a **live** system clock:
 * the lens-time engine itself never calls `new Date()` (it has a
 * determinism guard), so the only impurity — sampling the real "now" for
 * the relative-age field — lives here in the adapter. `now()` is read on
 * each parse, so the relative age stays current as the user edits.
 */

const SHARED_UTF8_ENCODER = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

const SYSTEM_CLOCK = { now: (): string => new Date().toISOString() };

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildTimeRegistration(SYSTEM_CLOCK));
  return r;
})();

export interface ParsedTime {
  /** The resolved instant, or null when the input was empty / invalid. */
  readonly instant: TimeInstant | null;
  /** JSON summary of the instant; null when there is no instant. */
  readonly jsonOutput: string | null;
  /** Markdown summary of the instant; null when there is no instant. */
  readonly markdownOutput: string | null;
  /** The ISO-8601 UTC string; null when there is no instant. */
  readonly isoOutput: string | null;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

/**
 * Run `time.parse` over the raw input and render the engine's JSON,
 * markdown, and ISO exporters. Output strings come from the real engine
 * exporters (not re-derived in the UI), so the tab can't drift from the
 * engine's behavior.
 */
export function parseTimeInput(raw: string): ParsedTime {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'time', 'time.parse', {
    raw,
    source: { kind: 'paste', bytes },
  });

  const artifact = result.artifacts.find(
    (a): a is TimeInstantArtifact => a.kind === TIME_KIND_INSTANT,
  );

  let jsonOutput: string | null = null;
  let markdownOutput: string | null = null;
  let isoOutput: string | null = null;
  if (artifact !== undefined) {
    jsonOutput = String(
      runExporter(registry, 'time', 'time.export.json', {
        artifacts: [artifact],
        diagnostics: result.diagnostics,
      }).body,
    );
    markdownOutput = String(
      runExporter(registry, 'time', 'time.export.markdown.summary', {
        artifacts: [artifact],
        diagnostics: result.diagnostics,
      }).body,
    );
    isoOutput = String(
      runExporter(registry, 'time', 'time.export.iso', {
        artifacts: [artifact],
        diagnostics: [],
      }).body,
    );
  }

  return {
    instant: artifact?.value ?? null,
    jsonOutput,
    markdownOutput,
    isoOutput,
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}
