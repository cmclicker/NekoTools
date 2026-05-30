import type { DurationReport } from './kinds.js';

/**
 * NekoDuration Pro generator. Backs ONE of the two declared Pro exporters:
 * `duration.export.breakdown.csv` (pro entitlement `export.breakdown.csv`).
 *
 * The other declared Pro id — `duration.export.locale` (`locale.format`) —
 * needs locale-specific human formatting ("1 hour 30 minutes" in other
 * languages), which the manifest's out-of-scope list explicitly excludes and
 * which would require bundled i18n data. It stays advertising-only (not
 * registered), exactly as NekoRegex left suite/snapshot advertising-only.
 *
 * This generator is a pure, deterministic function of the parsed
 * `duration.parsed` entries — no network, no clock, no premium engine.
 */

function csvField(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * `duration.export.breakdown.csv` — a CSV grid: one row per input with the
 * total seconds, the d/h/m/s component decomposition, the normalized ISO
 * form, and whether the value is approximate. Invalid lines emit a row with
 * empty numeric cells so the grid stays aligned with the input.
 */
export function toBreakdownCsv(report: DurationReport): string {
  const header = ['input', 'totalSeconds', 'days', 'hours', 'minutes', 'seconds', 'iso', 'approximate'];
  const rows: string[] = [header.join(',')];
  for (const e of report.entries) {
    if (!e.valid || e.value === null) {
      rows.push([csvField(e.input), '', '', '', '', '', '', ''].join(','));
      continue;
    }
    const v = e.value;
    const c = v.components;
    rows.push(
      [
        csvField(e.input),
        String(v.totalSeconds),
        String(c.days),
        String(c.hours),
        String(c.minutes),
        String(c.seconds),
        csvField(v.iso),
        v.approximate ? 'true' : 'false',
      ].join(','),
    );
  }
  return rows.join('\n');
}
