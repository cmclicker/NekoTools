import type { DurationReport } from './kinds.js';

/**
 * NekoDuration Pro generators, backing both declared Pro exporters:
 *   - `duration.export.breakdown.csv` (pro `export.breakdown.csv`)
 *   - `duration.export.locale` (pro `export.locale` / `locale.format`)
 *
 * Both are pure, deterministic functions of the parsed `duration.parsed`
 * entries — no network, no clock, no premium engine. Locale formatting uses
 * the HOST `Intl` runtime only (no bundled CLDR/ICU data ships), which is what
 * the amended manifest outOfScope now allows.
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

/** The fixed locale set the locale export renders each duration in. */
export const LOCALE_SET = ['en', 'de', 'fr', 'es', 'ja'] as const;

/** Non-zero d/h/m/s components, each formatted via Intl in the given locale. */
function localizedParts(
  locale: string,
  c: { days: number; hours: number; minutes: number; seconds: number },
): string {
  const units: [number, Intl.NumberFormatOptions['unit']][] = [
    [c.days, 'day'],
    [c.hours, 'hour'],
    [c.minutes, 'minute'],
    [c.seconds, 'second'],
  ];
  const parts = units
    .filter(([n]) => n > 0)
    .map(([n, unit]) =>
      new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(n),
    );
  // All-zero duration → render "0 seconds" in-locale rather than empty.
  if (parts.length === 0) {
    return new Intl.NumberFormat(locale, { style: 'unit', unit: 'second', unitDisplay: 'long' }).format(0);
  }
  return new Intl.ListFormat(locale, { style: 'long', type: 'unit' }).format(parts);
}

/**
 * `duration.export.locale` — render each parsed duration's d/h/m/s components
 * as human text across a fixed locale set, using the host `Intl` runtime only
 * (Intl.NumberFormat unit style + Intl.ListFormat). No bundled locale data, no
 * network. Markdown: one section per input, a `| locale | formatted |` table.
 */
export function toLocale(report: DurationReport): string {
  const out: string[] = ['# NekoDuration locale formatting', ''];
  for (const e of report.entries) {
    out.push(`## \`${e.input}\``, '');
    if (!e.valid || e.value === null) {
      out.push('(invalid duration)', '');
      continue;
    }
    out.push('| locale | formatted |', '| --- | --- |');
    for (const locale of LOCALE_SET) {
      out.push(`| ${locale} | ${localizedParts(locale, e.value.components)} |`);
    }
    out.push('');
  }
  return out.join('\n').trimEnd() + '\n';
}
