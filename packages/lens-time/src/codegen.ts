import type { TimeInstant } from './kinds.js';

/**
 * NekoTime Pro code generation. Backs the declared Pro exporters
 * `time.export.batch.csv` (pro entitlement `batch.convert`) and
 * `time.export.timezone.board` (pro entitlement `timezone.board`).
 *
 * Both are pure, deterministic functions of an already-resolved
 * `time.instant` — no network, no clock, no premium-engine dependency, and
 * no bundled timezone database. The timezone board reads wall-clock values
 * from the host `Intl` runtime (which the offline policy explicitly allows:
 * it only forbids "timezone data beyond what the host Intl runtime
 * provides"). Given a fixed epoch the structural output (zones, normalized
 * `±HH:MM` offsets, ISO-derived UTC time) is stable; only the locale-rendered
 * wall-clock strings can vary with the host's ICU version.
 *
 * Offset math note: the resolver fixed a historical UTC `-0` offset bug with
 * `+ 0`. This module never does `getTimezoneOffset()` arithmetic — the CSV
 * reuses the instant's already-computed `offsetLabel`, and the board derives
 * each zone's offset from `Intl` `longOffset` text — so there is no `-0` to
 * reintroduce.
 */

// --- CSV (batch.convert) ---------------------------------------------------

/** RFC-4180 field quoting: wrap in quotes (doubling embedded quotes) when the
 * value contains a comma, quote, CR, or LF; otherwise emit it bare. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvRow(cells: readonly string[]): string {
  return cells.map(csvField).join(',');
}

/** The fixed column order of the batch grid. */
const CSV_HEADER = [
  'interpretation',
  'iso',
  'epochSeconds',
  'epochMillis',
  'utc',
  'localFormatted',
  'offsetLabel',
  'relative',
] as const;

/**
 * Render resolved instant(s) as an RFC-4180 CSV grid: a header row followed
 * by one row per instant. The `time.instant` artifact carries a single
 * instant, so a one-instant input yields a one-row body; the function is
 * written against a list so a workspace holding several instants exports the
 * full grid. Every field is reused from the instant (notably `offsetLabel`,
 * never recomputed). Rows are separated by CRLF per the spec; the trailing
 * record has no terminator.
 */
export function toBatchCsv(instants: readonly TimeInstant[]): string {
  const rows: string[] = [csvRow(CSV_HEADER)];
  for (const instant of instants) {
    rows.push(
      csvRow([
        instant.interpretation,
        instant.iso,
        String(instant.epochSeconds),
        String(instant.epochMillis),
        // `iso` is already the canonical UTC rendering; surface it under a
        // plain `utc` column too so the grid reads without ISO familiarity.
        instant.iso,
        instant.local.formatted,
        instant.local.offsetLabel,
        instant.relative.label,
      ]),
    );
  }
  return rows.join('\r\n');
}

// --- Timezone board (timezone.board) ---------------------------------------

/**
 * The fixed set of major IANA zones the board renders. Stable + ordered so
 * the markdown output is deterministic. UTC leads; the rest span the common
 * business regions. All are resolvable from the host `Intl` runtime.
 */
export const BOARD_ZONES: readonly string[] = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Australia/Sydney',
];

/**
 * Normalize the host `Intl` `longOffset` zone-name (e.g. `GMT-05:00`,
 * `GMT+05:30`, or a bare `GMT` for a zero offset) into a stable `±HH:MM`
 * label. Working from the text — rather than `getTimezoneOffset()` — keeps
 * the result ICU-shape-tolerant and free of the `-0` arithmetic gotcha; a
 * bare `GMT` deterministically becomes `+00:00`.
 */
function normalizeOffsetLabel(longOffset: string): string {
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(longOffset);
  if (match === null) return '+00:00';
  const sign = match[1];
  const hh = match[2];
  const mm = match[3] ?? '00';
  return `${sign}${hh}:${mm}`;
}

function zoneOffsetLabel(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(
    date,
  );
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  return normalizeOffsetLabel(name);
}

function zoneLocalTime(date: Date, timeZone: string): string {
  // `en-US` fixes the *format* across runs; the `timeZone` supplies the
  // wall-clock *value* (the whole point of the board). `dateStyle`/`timeStyle`
  // medium keeps it compact and human-readable.
  return new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'medium', timeStyle: 'medium' }).format(
    date,
  );
}

/** Escape a `|` so it cannot break the markdown table grid. */
function mdCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

/**
 * Render the resolved instant across `BOARD_ZONES` as a markdown table:
 * `zone | local time | offset`. Deterministic for a given epoch; the
 * wall-clock value column is read from the host `Intl` runtime (allowed
 * host data — no network, no bundled tz db). A `null` instant produces just
 * the heading and an empty-state line.
 */
export function toTimezoneBoard(instant: TimeInstant | null): string {
  const lines: string[] = ['# NekoTime — timezone board', ''];
  if (instant === null) {
    lines.push('_No instant resolved._', '');
    return lines.join('\n');
  }

  lines.push(
    `- **Instant (UTC)**: ${instant.iso}`,
    `- **Epoch (ms)**: ${instant.epochMillis}`,
    '',
    '| Zone | Local time | Offset |',
    '| --- | --- | --- |',
  );

  const date = new Date(instant.epochMs);
  for (const zone of BOARD_ZONES) {
    lines.push(
      `| ${mdCell(zone)} | ${mdCell(zoneLocalTime(date, zone))} | ${mdCell(zoneOffsetLabel(date, zone))} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
