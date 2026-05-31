import type { ParsedCron } from './kinds.js';

/**
 * NekoCron Pro code generation. Backs the declared Pro exporters
 * `cron.export.ical` (pro entitlement `export.ical`) and
 * `cron.export.timezone.report` (pro entitlements `export.timezone.report` /
 * `timezone.aware`).
 *
 * Both are pure, deterministic functions of an already-parsed `cron.parsed`
 * value — specifically its `nextRuns`, which the parser has ALREADY computed
 * as ISO-8601 UTC instants from the injected clock. No network, no clock, no
 * premium-engine dependency, no re-scheduling.
 *
 * Scope honesty (mirrors the manifest's outOfScope): NekoCron only explains
 * expressions and computes next runs in UTC. So:
 *   - the iCal export is a best-effort calendar of the FINITE set of
 *     already-computed next-run instants (one VEVENT each) — it never emits an
 *     infinite RRULE and makes no claim of full RRULE/recurrence semantics.
 *   - the timezone report RENDERS those same UTC instants in a fixed set of
 *     major IANA zones via `Intl.DateTimeFormat` (host ICU data, allowed
 *     offline). It does not re-schedule the cron in another zone.
 */

// --- iCalendar (VCALENDAR / VEVENT) ----------------------------------------

const ICAL_PRODID = '-//NekoTools//NekoCron//EN';

/**
 * Convert an ISO-8601 UTC instant (e.g. `2026-05-28T00:15:00.000Z`, as the
 * parser stores `nextRuns`) into an iCalendar UTC date-time
 * (`20260528T001500Z`). Returns `null` for a value that is not a `...Z`
 * instant so the caller can skip it rather than emit a malformed DTSTART.
 */
function toICalUtc(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso);
  if (m === null) return null;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}${mo}${d}T${h}${mi}${s}Z`;
}

/** Escape a text value for an iCal property (RFC 5545 §3.3.11). */
function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Generate a minimal, valid iCalendar document for a parsed cron value. Emits
 * one `VEVENT` per already-computed next-run instant — a FINITE set, which is
 * the honest representation given NekoCron computes a fixed window of UTC next
 * runs rather than recurrence rules. No `RRULE` is emitted.
 *
 * Each VEVENT carries a deterministic UID (derived from the expression + the
 * instant, not a clock or randomness), a `DTSTART` in UTC, and a `SUMMARY`
 * referencing the cron expression. A leading comment records that these are
 * the next occurrences, not a recurrence rule. Returns a calendar with no
 * events (still valid) when there are no next runs (e.g. `@reboot`).
 */
export function toICalendar(value: ParsedCron | null): string {
  const expression = value?.expression ?? '';
  const runs = value?.nextRuns ?? [];
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${ICAL_PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    // Honest about scope: a finite snapshot of the computed next runs, not an
    // infinite RRULE recurrence. NekoCron only explains expressions.
    `X-NEKOCRON-NOTE:Finite snapshot of the next ${runs.length} computed run(s); not an RRULE recurrence.`,
  ];

  runs.forEach((iso, index) => {
    const dt = toICalUtc(iso);
    if (dt === null) return;
    lines.push(
      'BEGIN:VEVENT',
      `UID:nekocron-${index}-${dt}@nekotools`,
      `DTSTAMP:${dt}`,
      `DTSTART:${dt}`,
      `SUMMARY:${escapeICalText(`Cron: ${expression}`)}`,
      `DESCRIPTION:${escapeICalText(`Computed next run for cron expression "${expression}" (UTC).`)}`,
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');
  // RFC 5545 lines are CRLF-terminated.
  return `${lines.join('\r\n')}\r\n`;
}

// --- Timezone report (Markdown) --------------------------------------------

/**
 * A fixed, deterministic set of major IANA zones the report renders each
 * already-computed UTC instant in. Held constant (not user-supplied) so output
 * is stable; `UTC` is first so the source instant is always shown verbatim.
 */
export const TIMEZONE_REPORT_ZONES: readonly string[] = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Australia/Sydney',
];

/**
 * Render a single UTC instant in a given IANA zone using `Intl.DateTimeFormat`
 * (host ICU data — pure and offline). Uses an ISO-ish, locale-independent
 * format (`en-CA` yields `YYYY-MM-DD`) with an explicit `timeZoneName` so the
 * offset/abbreviation is visible. Falls back to the raw ISO string if the host
 * cannot resolve the zone, keeping the function total and never throwing.
 */
function renderInZone(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    });
    return fmt.format(date);
  } catch {
    return iso;
  }
}

/**
 * Generate a Markdown timezone report for a parsed cron value: a table whose
 * rows are the already-computed UTC next-run instants and whose columns are the
 * fixed `TIMEZONE_REPORT_ZONES`. Each cell is that UTC instant rendered in the
 * column's zone via `Intl.DateTimeFormat`.
 *
 * This RENDERS existing UTC instants in other zones; it does NOT re-schedule
 * the cron expression per zone (timezone-aware scheduling is out of scope).
 * The first column header is `UTC` and each row's first column repeats the raw
 * UTC ISO instant so the source of truth is unambiguous and ICU-stable.
 */
export function toTimezoneReport(value: ParsedCron | null): string {
  const expression = value?.expression ?? '';
  const runs = value?.nextRuns ?? [];
  const lines: string[] = [
    '# NekoCron timezone report',
    '',
    `- expression: \`${expression}\``,
    '- source: next runs are computed in UTC; the columns below render each of',
    '  those same instants in other zones (display only — not re-scheduled).',
    '',
  ];

  if (runs.length === 0) {
    lines.push('_No scheduled runs to report._');
    return lines.join('\n');
  }

  const header = ['UTC (instant)', ...TIMEZONE_REPORT_ZONES];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);

  for (const iso of runs) {
    const cells = [iso, ...TIMEZONE_REPORT_ZONES.map((tz) => renderInZone(iso, tz))];
    lines.push(`| ${cells.join(' | ')} |`);
  }

  return lines.join('\n');
}
