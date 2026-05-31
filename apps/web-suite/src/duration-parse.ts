import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildDurationRegistration,
  FIXED_CLOCK,
  DURATION_KIND_PARSED,
  type DurationEntry,
  type DurationParsedArtifact,
} from '@nekotools/lens-duration';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoDuration UI parse helper, extracted out of DurationApp for
 * testability. Output strings come from the real engine exporters. The Pro
 * breakdown-CSV export is gated: `runExporter` throws EntitlementError for a
 * free caller, surfaced here as null so the UI shows the Pro-lock (same
 * pattern as hex-parse.ts).
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildDurationRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedDurationView {
  readonly count: number;
  readonly entries: readonly DurationEntry[];
  readonly json: string;
  readonly normalized: string;
  readonly markdown: string;
  /** Pro: per-input d/h/m/s CSV breakdown, or null when not entitled. */
  readonly breakdownCsv: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseDurationInput(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedDurationView {
  const result = runParser(registry, 'duration', 'duration.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });

  const artifact = result.artifacts.find(
    (a): a is DurationParsedArtifact => a.kind === DURATION_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'duration', id, exportInput).body) : fallback;
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'duration', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    count: value?.count ?? 0,
    entries: value?.entries ?? [],
    json: run('duration.export.json', '{}'),
    normalized: run('duration.export.normalized', ''),
    markdown: run('duration.export.markdown.summary', ''),
    breakdownCsv: runPro('duration.export.breakdown.csv'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
  };
}
