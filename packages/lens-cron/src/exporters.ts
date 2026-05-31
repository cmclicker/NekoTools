import type { Exporter } from '@nekotools/contracts';

import {
  CRON_KIND_PARSED,
  CRON_PARSED_EXPORT_KINDS,
  type CronArtifact,
  type CronParsedArtifact,
  type ParsedCron,
} from './kinds.js';
import { toICalendar, toTimezoneReport } from './codegen.js';

const TOOL_ID = 'cron';

function pickParsed(artifacts: readonly CronArtifact[]): CronParsedArtifact | undefined {
  return artifacts.find((a): a is CronParsedArtifact => a.kind === CRON_KIND_PARSED);
}

/** `cron.export.json` — the full parsed structure (fields + next runs). */
export const jsonExporter: Exporter<CronArtifact> = {
  version: 1,
  id: 'cron.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: CRON_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? null;
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(value, null, 2) };
  },
};

/** `cron.export.next-runs` — the upcoming run times, one ISO-8601 UTC per line. */
export const nextRunsExporter: Exporter<CronArtifact> = {
  version: 1,
  id: 'cron.export.next-runs',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: CRON_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const runs = pickParsed(artifacts)?.value.nextRuns ?? [];
    return { mimeType: 'text/plain', extension: 'txt', body: runs.join('\n') };
  },
};

/** `cron.export.markdown.summary` — description, next runs, and field breakdown. */
export const markdownSummaryExporter: Exporter<CronArtifact> = {
  version: 1,
  id: 'cron.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: CRON_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const value: ParsedCron | undefined = pickParsed(artifacts)?.value;
    const lines: string[] = ['# NekoCron export', ''];

    if (value === undefined || !value.valid) {
      lines.push('- valid: no');
    } else {
      lines.push(`- expression: \`${value.expression}\``, `- description: ${value.description}`);
      if (value.fields !== null) {
        lines.push('', '## Fields', '');
        for (const f of value.fields) {
          lines.push(`- **${f.name}** \`${f.raw}\` → ${f.values.join(', ')}`);
        }
      }
      if (value.nextRuns.length > 0) {
        lines.push('', '## Next runs (UTC)', '');
        for (const r of value.nextRuns) lines.push(`- ${r}`);
      }
    }

    if (diagnostics.length > 0) {
      lines.push('', '## Diagnostics', '');
      for (const d of diagnostics) lines.push(`- **${d.severity.toUpperCase()}** \`${d.code}\` — ${d.message}`);
    }

    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<CronArtifact>[] = [
  jsonExporter,
  nextRunsExporter,
  markdownSummaryExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------
//
// These back the manifest's declared Pro exporter ids (`export.ical` /
// `export.timezone.report`). Each derives purely from the already-parsed
// `cron.parsed` value — specifically its `nextRuns`, which the parser computed
// as UTC instants — with no network, no clock, and no premium-engine
// dependency. Generation lives in `codegen.ts`. Honest about scope: the iCal
// export is a finite snapshot of the computed next runs (one VEVENT each, no
// RRULE), and the timezone report only renders those UTC instants in other
// zones (it does not re-schedule).

/**
 * `cron.export.ical` (Pro) — a minimal iCalendar (VCALENDAR) with one VEVENT
 * per already-computed next-run instant (DTSTART in UTC). Not an RRULE.
 */
export const icalExporter: Exporter<CronArtifact> = {
  version: 1,
  id: 'cron.export.ical',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: CRON_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/calendar',
  producesExtension: 'ics',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? null;
    return { mimeType: 'text/calendar', extension: 'ics', body: toICalendar(value) };
  },
};

/**
 * `cron.export.timezone.report` (Pro) — a Markdown table rendering each
 * already-computed UTC next-run instant across a fixed set of major IANA
 * zones via `Intl.DateTimeFormat`. Display only — not re-scheduled.
 */
export const timezoneReportExporter: Exporter<CronArtifact> = {
  version: 1,
  id: 'cron.export.timezone.report',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: CRON_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? null;
    return { mimeType: 'text/markdown', extension: 'md', body: toTimezoneReport(value) };
  },
};

export const proExporters: readonly Exporter<CronArtifact>[] = [
  icalExporter,
  timezoneReportExporter,
];
