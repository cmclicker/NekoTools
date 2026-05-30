import { CASE_FORMS, type CaseFormId } from './case.js';
import type { CaseReport } from './kinds.js';

/**
 * NekoCase Pro generators. Back the declared Pro exporters
 * `case.export.csv` (pro entitlement `export.csv`) and
 * `case.export.single-form` (pro entitlements `pick.single-form` /
 * `export.single-form`).
 *
 * Both are pure, deterministic functions of the parsed `case.parsed`
 * entries — no network, no clock, no premium engine. The custom-acronym
 * dictionary, Unicode transliteration, and batch-rename Pro features stay
 * advertising-only (per the manifest's out-of-scope list).
 */

/** The default single form when none is otherwise specified. */
export const DEFAULT_SINGLE_FORM: CaseFormId = 'camel';

function csvField(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * `case.export.csv` — a CSV grid: header `input` + every case form, then one
 * row per parsed entry. RFC-4180 quoting. Useful for bulk rename sheets.
 */
export function toCsv(report: CaseReport): string {
  const header = ['input', ...CASE_FORMS];
  const rows: string[] = [header.map(csvField).join(',')];
  for (const e of report.entries) {
    const cells = [e.input, ...CASE_FORMS.map((f) => e.forms[f] ?? '')];
    rows.push(cells.map(csvField).join(','));
  }
  return rows.join('\n');
}

/**
 * `case.export.single-form` — render just one chosen case form, one entry
 * per line. Defaults to camelCase (the most common identifier target);
 * an unknown form id falls back to the default. Pure projection.
 */
export function toSingleForm(report: CaseReport, form: CaseFormId = DEFAULT_SINGLE_FORM): string {
  const chosen: CaseFormId = CASE_FORMS.includes(form) ? form : DEFAULT_SINGLE_FORM;
  return report.entries.map((e) => e.forms[chosen] ?? '').join('\n');
}
