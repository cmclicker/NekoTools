import type { ParsedId } from './kinds.js';

/**
 * NekoUUID Pro code generation. Backs the declared Pro exporters
 * `uuid.export.namespace.report` (pro entitlement `export.namespace.report`)
 * and `uuid.export.bulk.csv` (pro entitlement `export.bulk.csv`).
 *
 * Both are pure, deterministic projections of the *already-parsed* `ids[]`
 * on a `uuid.parsed` artifact — no network, no clock, no randomness, no
 * premium-engine dependency. They DESCRIBE what was pasted; they never
 * generate identifiers, reverse v3/v5 name hashes, or extract a v1 node MAC
 * (all out-of-scope per the manifest). Embedded timestamps are taken verbatim
 * from `ParsedId.timestamp`, which the parser already rendered in UTC.
 */

// --- Namespace / version report (Markdown) ---------------------------------

/** A short tag for an id's version slot (nil / max / vN / "—"). */
function versionTag(id: ParsedId): string {
  if (id.isNil) return 'nil';
  if (id.isMax) return 'max';
  return id.version !== null ? `v${id.version}` : '—';
}

/**
 * Render a Markdown report over the parsed ids: a per-id breakdown of
 * version, variant, and (for time-based versions) the embedded UTC timestamp,
 * followed by a count summary grouped by version tag. This is a report on
 * *what was pasted* — it neither generates namespace UUIDs nor reverses any
 * hash. An empty `ids` list yields a stable header-only report.
 */
export function toNamespaceReport(ids: readonly ParsedId[]): string {
  const lines: string[] = ['# NekoUUID namespace report', '', `- identifiers: ${ids.length}`];

  if (ids.length > 0) {
    lines.push('', '## Identifiers', '');
    for (const id of ids) {
      lines.push(`### \`${id.input}\``, '');
      lines.push(`- kind: ${id.kind}`);
      lines.push(`- version: ${versionTag(id)}`);
      lines.push(`- variant: ${id.variant ?? '—'}`);
      lines.push(`- timestamp: ${id.timestamp ?? '—'}`);
      lines.push('');
    }

    // Count summary grouped by version tag, in first-seen order (deterministic).
    const counts = new Map<string, number>();
    for (const id of ids) {
      const tag = versionTag(id);
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    lines.push('## Summary by version', '');
    for (const [tag, count] of counts) {
      lines.push(`- ${tag}: ${count}`);
    }
  }

  return lines.join('\n');
}

// --- Bulk CSV --------------------------------------------------------------

const CSV_COLUMNS = [
  'input',
  'valid',
  'version',
  'variant',
  'normalized',
  'timestamp',
  'isNil',
  'isMax',
] as const;

/** Quote a CSV field per RFC 4180: wrap in quotes (doubling embedded quotes)
 *  when it contains a comma, quote, CR or LF; otherwise emit it bare. */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function cell(value: string | number | boolean | null): string {
  if (value === null) return '';
  return csvField(String(value));
}

/**
 * Project the parsed ids to an RFC-4180 CSV grid: a header row plus one row
 * per id, with columns input, valid, version, variant, normalized, timestamp,
 * isNil, isMax. Pure projection of `ids[]` — no generation, no reversal.
 * Rows are joined with CRLF (RFC 4180); an empty `ids` list yields just the
 * header row.
 */
export function toBulkCsv(ids: readonly ParsedId[]): string {
  const rows: string[] = [CSV_COLUMNS.join(',')];
  for (const id of ids) {
    rows.push(
      [
        cell(id.input),
        cell(id.valid),
        cell(id.version),
        cell(id.variant),
        cell(id.normalized),
        cell(id.timestamp),
        cell(id.isNil),
        cell(id.isMax),
      ].join(','),
    );
  }
  return rows.join('\r\n');
}
