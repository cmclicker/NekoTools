/**
 * Self-contained duration core: parse ISO-8601 durations, humanized strings
 * ("1h30m", "90 min", "1.5h"), and bare seconds; produce total seconds,
 * a normalized ISO form, and a human-readable form. No deps, no network.
 *
 * Years and months use average lengths (365.25 d / 30.44 d), so any input
 * containing them is flagged `approximate`.
 */

export interface DurationComponents {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
}

export type DurationSource = 'iso' | 'humanized' | 'seconds';

export interface ParsedDuration {
  readonly source: DurationSource;
  readonly totalSeconds: number;
  /** Decomposition of `totalSeconds` into days/hours/minutes/seconds. */
  readonly components: DurationComponents;
  /** Canonical ISO-8601 (`PnDTnHnMnS`), derived from `totalSeconds`. */
  readonly iso: string;
  /** Human-readable form, e.g. "1d 2h 30m". */
  readonly human: string;
  /** True when years/months were involved (average-length approximation). */
  readonly approximate: boolean;
}

const SEC = {
  y: 31557600, // 365.25 d
  mo: 2629800, // 30.4375 d
  w: 604800,
  d: 86400,
  h: 3600,
  min: 60,
  s: 1,
} as const;

const ISO_RE =
  /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;

// Longest-first alternation so "mo"/"months" win over "m", etc.
const TOKEN_RE =
  /(\d+(?:\.\d+)?)\s*(years?|yrs?|y|months?|mon|mo|weeks?|wks?|w|days?|d|hours?|hrs?|h|minutes?|mins?|min|m|seconds?|secs?|sec|s)/gi;

function unitSeconds(unit: string): number {
  const u = unit.toLowerCase();
  if (/^(y|yr|yrs|year|years)$/.test(u)) return SEC.y;
  if (/^(mo|mon|month|months)$/.test(u)) return SEC.mo;
  if (/^(w|wk|wks|week|weeks)$/.test(u)) return SEC.w;
  if (/^(d|day|days)$/.test(u)) return SEC.d;
  if (/^(h|hr|hrs|hour|hours)$/.test(u)) return SEC.h;
  if (/^(m|min|mins|minute|minutes)$/.test(u)) return SEC.min;
  return SEC.s;
}

function isApproxUnit(unit: string): boolean {
  const u = unit.toLowerCase();
  return /^(y|yr|yrs|year|years|mo|mon|month|months)$/.test(u);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function parseDuration(input: string): ParsedDuration | null {
  const s = input.trim();
  if (s === '') return null;

  // Bare seconds.
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    return finalize(Number(s), 'seconds', false);
  }

  // ISO-8601.
  const iso = ISO_RE.exec(s);
  if (iso !== null && iso.slice(1).some((g) => g !== undefined)) {
    const [, y, mo, w, d, h, mi, sec] = iso;
    let total = 0;
    if (y) total += Number(y) * SEC.y;
    if (mo) total += Number(mo) * SEC.mo;
    if (w) total += Number(w) * SEC.w;
    if (d) total += Number(d) * SEC.d;
    if (h) total += Number(h) * SEC.h;
    if (mi) total += Number(mi) * SEC.min;
    if (sec) total += Number(sec) * SEC.s;
    return finalize(total, 'iso', Boolean(y || mo));
  }

  // Humanized "1h30m", "90 min", "1d 2h".
  let total = 0;
  let matched = 0;
  let approximate = false;
  for (const m of s.matchAll(TOKEN_RE)) {
    total += Number(m[1]) * unitSeconds(m[2]!);
    if (isApproxUnit(m[2]!)) approximate = true;
    matched += 1;
  }
  // Require at least one token, and reject leftover non-token characters
  // (besides whitespace/commas) so "hello" / "1 banana" don't parse.
  if (matched === 0) return null;
  if (s.replace(TOKEN_RE, '').replace(/[\s,]+/g, '') !== '') return null;
  return finalize(total, 'humanized', approximate);
}

function decompose(totalSeconds: number): DurationComponents {
  let rem = totalSeconds;
  const days = Math.floor(rem / SEC.d);
  rem -= days * SEC.d;
  const hours = Math.floor(rem / SEC.h);
  rem -= hours * SEC.h;
  const minutes = Math.floor(rem / SEC.min);
  rem -= minutes * SEC.min;
  return { days, hours, minutes, seconds: round3(rem) };
}

function toIso(c: DurationComponents): string {
  const date = c.days > 0 ? `${c.days}D` : '';
  let time = '';
  if (c.hours > 0) time += `${c.hours}H`;
  if (c.minutes > 0) time += `${c.minutes}M`;
  if (c.seconds > 0) time += `${c.seconds}S`;
  if (date === '' && time === '') return 'PT0S';
  return `P${date}${time === '' ? '' : `T${time}`}`;
}

function toHuman(c: DurationComponents): string {
  const parts: string[] = [];
  if (c.days > 0) parts.push(`${c.days}d`);
  if (c.hours > 0) parts.push(`${c.hours}h`);
  if (c.minutes > 0) parts.push(`${c.minutes}m`);
  if (c.seconds > 0) parts.push(`${c.seconds}s`);
  return parts.length === 0 ? '0s' : parts.join(' ');
}

function finalize(totalSeconds: number, source: DurationSource, approximate: boolean): ParsedDuration {
  const total = round3(totalSeconds);
  const components = decompose(total);
  return { source, totalSeconds: total, components, iso: toIso(components), human: toHuman(components), approximate };
}
