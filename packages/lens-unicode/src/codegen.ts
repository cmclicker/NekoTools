import type { CodepointInfo } from './unicode.js';

import { codepointName } from './names-data.js';

/**
 * NekoUnicode Pro code generation. Backs the declared Pro exporters
 * `unicode.export.names` (pro entitlement `export.names` / `lookup.names`) and
 * `unicode.export.csv` (pro entitlement `export.csv`).
 *
 * Both are pure, deterministic functions of a parsed `unicode.parsed` report's
 * code points — no network, no clock, no premium-engine dependency. Names come
 * from `./names-data.js`: an algorithmic layer (C0/C1 controls, DELETE) plus a
 * small curated map of common code points, with a principled, clearly-synthetic
 * fallback (`U+XXXX (<category>)`) for everything else. We never emit a guessed
 * Unicode name — accuracy over coverage. This is NOT the full UCD.
 */

/**
 * A display-safe rendering of the character for a table cell: control / format
 * code points (and other non-printables) would corrupt the grid, so they are
 * shown as a middle dot `·` rather than the raw code unit. The real character
 * is always recoverable from the `codepoint` / `U+XXXX` columns.
 */
function safeChar(c: CodepointInfo): string {
  if (c.isControl) return '·';
  // Other invisible/format separators that would break a table cell.
  if (c.category === 'control' || c.category === 'separator' || c.category === 'other') {
    return c.codepoint === 0x20 ? ' ' : '·';
  }
  return c.char;
}

// --- names (markdown) ------------------------------------------------------

/** Escape a string for safe inclusion inside a markdown table cell. */
function mdCell(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * Render a markdown table of `U+XXXX | char | name`, one row per code point.
 * The name is the exact standard name where known (controls + curated map),
 * else the principled `U+XXXX (<category>)` fallback. An empty input yields the
 * heading + an empty-state line rather than a header-only table.
 */
export function toNamesMarkdown(codepoints: readonly CodepointInfo[]): string {
  const lines: string[] = ['# NekoUnicode names', ''];
  if (codepoints.length === 0) {
    lines.push('(no code points)');
    return lines.join('\n');
  }
  lines.push('| codepoint | char | name |', '| --- | --- | --- |');
  for (const c of codepoints) {
    const name = codepointName(c.codepoint, c.category);
    lines.push(`| ${c.hex} | \`${mdCell(safeChar(c))}\` | ${mdCell(name)} |`);
  }
  return lines.join('\n');
}

// --- CSV (RFC 4180) --------------------------------------------------------

/** RFC-4180 quoting: wrap in double quotes + double inner quotes when needed. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvRow(cells: readonly string[]): string {
  return cells.map(csvCell).join(',');
}

/** Column headers for the CSV grid, in emission order. */
export const CSV_COLUMNS: readonly string[] = [
  'index',
  'codepoint',
  'char',
  'name',
  'decimal',
  'category',
  'utf8',
  'utf16',
  'jsEscape',
  'htmlEntity',
  'urlEncoded',
];

/**
 * Render an RFC-4180 CSV grid: a header row (`CSV_COLUMNS`) then one row per
 * code point carrying its index plus everything `CodepointInfo` already knows
 * (the `U+XXXX` notation, the character, the derived name, decimal, general
 * category, UTF-8 / UTF-16 bytes, and the escape forms). Rows are joined with
 * CRLF per RFC 4180. An empty input yields just the header row.
 */
export function toCodepointCsv(codepoints: readonly CodepointInfo[]): string {
  const rows: string[] = [csvRow(CSV_COLUMNS)];
  codepoints.forEach((c, index) => {
    rows.push(
      csvRow([
        String(index),
        c.hex,
        safeChar(c),
        codepointName(c.codepoint, c.category),
        String(c.decimal),
        c.category,
        c.utf8,
        c.utf16,
        c.jsEscape,
        c.htmlEntity,
        c.urlEncoded,
      ]),
    );
  });
  return rows.join('\r\n');
}
