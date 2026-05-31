import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildCronRegistration,
  FIXED_CLOCK,
  CRON_KIND_PARSED,
  type CronField,
  type CronParsedArtifact,
} from '@nekotools/lens-cron';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoCron UI parse helper, extracted out of CronApp for testability — the
 * same engine-adapter seam the other tools' `*-parse.ts` modules provide.
 * Next-run times use a clock seeded at module load so the UI shows runs
 * relative to "now"; output strings come from the real engine exporters. The
 * Pro iCal + timezone-report exports are gated: `runExporter` throws
 * EntitlementError for a free caller, surfaced here as null so the UI shows
 * the Pro-lock (same pattern as hex-parse.ts).
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildCronRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedCronView {
  readonly valid: boolean;
  readonly expression: string;
  readonly description: string;
  readonly fields: readonly CronField[] | null;
  readonly nextRuns: readonly string[];
  readonly json: string;
  readonly markdown: string;
  /** Pro: a minimal iCalendar (VCALENDAR) snapshot of the next runs, or null when not entitled. */
  readonly ical: string | null;
  /** Pro: a Markdown timezone report of the next runs, or null when not entitled. */
  readonly timezoneReport: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseCronInput(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedCronView {
  const result = runParser(registry, 'cron', 'cron.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });

  const artifact = result.artifacts.find(
    (a): a is CronParsedArtifact => a.kind === CRON_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'cron', id, exportInput).body) : fallback;
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'cron', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    valid: value?.valid ?? false,
    expression: value?.expression ?? '',
    description: value?.description ?? '',
    fields: value?.fields ?? null,
    nextRuns: value?.nextRuns ?? [],
    json: run('cron.export.json', 'null'),
    markdown: run('cron.export.markdown.summary', ''),
    ical: runPro('cron.export.ical'),
    timezoneReport: runPro('cron.export.timezone.report'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
  };
}
