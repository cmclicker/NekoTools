import type { MimeEntry, MimeReport } from './kinds.js';
import { lookupIana } from './iana-data.js';

/**
 * NekoMIME Pro code generation. Backs the declared Pro exporters
 * `mime.export.iana-lookup` (pro entitlement `export.iana-lookup` /
 * `lookup.iana-full`) and `mime.export.csv` (pro entitlement `export.csv`).
 *
 * Both are pure, deterministic functions of a decoded `mime.parsed` report —
 * no network, no clock, no premium-engine dependency. The IANA lookup reads
 * the bundled common-subset table in `./iana-data.js` (a static `const`, never
 * fetched); essences absent from that subset are reported as "not in bundled
 * subset" rather than omitted. The CSV is RFC-4180 quoted.
 */

const EMPTY_REPORT: MimeReport = { count: 0, entries: [] };

function reportOf(report: MimeReport | undefined): MimeReport {
  return report ?? EMPTY_REPORT;
}

// --- IANA lookup (Markdown) ------------------------------------------------

/**
 * Render a Markdown report that resolves each parsed entry's essence against
 * the bundled IANA subset: canonical name, file extensions, and category.
 * Entries whose essence is not in the subset (or that did not parse) are
 * listed as "not in bundled subset" so the output is one row per input.
 */
export function toIanaLookupMarkdown(report: MimeReport | undefined): string {
  const { entries } = reportOf(report);
  const lines: string[] = [
    '# NekoMIME IANA lookup',
    '',
    '_Resolved against the bundled common-subset table (not the full IANA registry)._',
    '',
    `- entries: ${entries.length}`,
    '',
    '| input | essence | canonical | category | extensions | notes |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const entry of entries) {
    lines.push(ianaRow(entry));
  }

  return lines.join('\n');
}

function ianaRow(entry: MimeEntry): string {
  if (!entry.valid || entry.value === null) {
    return `| ${cell(entry.input)} | — | — | — | — | invalid input |`;
  }

  const essence = entry.value.essence;
  const info = lookupIana(essence);
  if (info === undefined) {
    return `| ${cell(entry.input)} | ${code(essence)} | — | — | — | not in bundled subset |`;
  }

  const note = info.deprecatedAliasOf
    ? `deprecated alias of ${code(info.deprecatedAliasOf)}`
    : '';
  const extensions = info.extensions.length > 0 ? info.extensions.join(', ') : '—';
  return `| ${cell(entry.input)} | ${code(essence)} | ${code(info.canonical)} | ${info.category} | ${extensions} | ${note || '—'} |`;
}

/** Markdown table cell: backtick-wrap, escaping pipes so the column survives. */
function code(s: string): string {
  return `\`${s.replace(/\|/g, '\\|')}\``;
}

function cell(s: string): string {
  return code(s);
}

// --- CSV grid --------------------------------------------------------------

const CSV_HEADER = [
  'input',
  'valid',
  'type',
  'subtype',
  'suffix',
  'parameters',
  'extensions',
  'category',
] as const;

/**
 * Render the report as an RFC-4180 CSV grid: one row per parsed entry with the
 * decoded fields plus the bundled-subset extensions/category for the entry's
 * essence. The header row is always present. Fields are quoted only when they
 * contain a comma, quote, or newline (quotes doubled), per RFC 4180.
 */
export function toCsv(report: MimeReport | undefined): string {
  const { entries } = reportOf(report);
  const rows: string[] = [CSV_HEADER.map(csvField).join(',')];

  for (const entry of entries) {
    rows.push(csvRow(entry).map(csvField).join(','));
  }

  // RFC 4180 lines are CRLF-delimited.
  return rows.join('\r\n');
}

function csvRow(entry: MimeEntry): readonly string[] {
  const v = entry.value;
  if (!entry.valid || v === null) {
    return [entry.input, 'false', '', '', '', '', '', ''];
  }

  const info = lookupIana(v.essence);
  const parameters = v.parameters.map((p) => `${p.name}=${p.value}`).join('; ');
  return [
    entry.input,
    String(entry.valid),
    v.type,
    v.subtype,
    v.suffix ?? '',
    parameters,
    (info?.extensions ?? v.extensions).join('; '),
    info?.category ?? '',
  ];
}

/** RFC-4180 field quoting: wrap in quotes (doubling inner quotes) if needed. */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
