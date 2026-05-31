import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildTimeRegistration,
  TIME_KIND_INSTANT,
  type TimeInstant,
  type TimeInstantArtifact,
} from '@nekotools/lens-time';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

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
 *
 * The batch-CSV + timezone-board exports are Pro: `runExporter` throws
 * EntitlementError for a free caller, surfaced here as null so the UI shows
 * the Pro-lock (same pattern as hex-parse.ts / csv-parse.ts).
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
  /** Pro: the resolved instant(s) as an RFC-4180 CSV grid, or null when not entitled. */
  readonly batchCsv: string | null;
  /** Pro: the instant across major IANA zones as a markdown table, or null when not entitled. */
  readonly timezoneBoard: string | null;
  /** True when the effective entitlement unlocks the Pro exporters. */
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

/**
 * Run `time.parse` over the raw input and render the engine's JSON,
 * markdown, and ISO exporters. Output strings come from the real engine
 * exporters (not re-derived in the UI), so the tab can't drift from the
 * engine's behavior. The Pro batch-CSV + timezone-board exports are run
 * through the gated `runExporter`; a free caller is refused (null).
 */
export function parseTimeInput(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedTime {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'time', 'time.parse', {
    raw,
    source: { kind: 'paste', bytes },
  });

  const artifact = result.artifacts.find(
    (a): a is TimeInstantArtifact => a.kind === TIME_KIND_INSTANT,
  );
  const exportInput = {
    artifacts: artifact ? [artifact] : [],
    diagnostics: result.diagnostics,
  };
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'time', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

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
    batchCsv: runPro('time.export.batch.csv'),
    timezoneBoard: runPro('time.export.timezone.board'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}
