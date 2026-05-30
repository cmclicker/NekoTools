import { TIME_DIAGNOSTIC_CODES } from './diagnostics.js';
import type {
  LocalTimeInfo,
  RelativeAge,
  TimeInstant,
  TimeInterpretation,
} from './kinds.js';

/**
 * A lightweight, id-free issue produced by the pure resolver. The parser
 * maps these onto full `Diagnostic`s with reproducible ids.
 */
export interface TimeIssue {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
}

export interface ResolveResult {
  readonly instant: TimeInstant | null;
  readonly issues: readonly TimeIssue[];
}

/**
 * Largest absolute epoch-ms the ECMAScript `Date` can represent
 * (±100,000,000 days from the Unix epoch).
 */
const JS_DATE_MAX_MS = 8.64e15;

/**
 * Seconds-vs-milliseconds boundary for a bare number. A magnitude below
 * this is read as Unix **seconds** (covering years up to ~5138); at or
 * above it the value is read as **milliseconds** (a seconds value that
 * large would land past year 5138 — implausible). The choice is always
 * surfaced via a `time.unit_heuristic` diagnostic, so it is never silent.
 */
const SECONDS_MS_BOUNDARY = 1e11;

const INTEGER_RE = /^[+-]?\d+$/;
// A pragmatic ISO-8601-ish shape: calendar date, optional time + zone.
// Anything matching here is handed to `Date.parse` as an ISO string;
// anything else that still parses is treated as a (locale-dependent,
// hence ambiguous) human date string.
const ISO_RE =
  /^[+-]?\d{4,6}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Resolve raw user input into a `TimeInstant` (or `null` + diagnostics).
 *
 * Pure: the result depends only on `raw` and the supplied `nowMs` — which
 * is "now" sampled from the injected clock, never `new Date()`. That makes
 * the whole output (including the relative age) reproducible under a fixed
 * clock. Never throws.
 */
export function resolveTimeInput(raw: string, nowMs: number): ResolveResult {
  const issues: TimeIssue[] = [];
  const trimmed = raw.trim();

  if (trimmed === '') {
    issues.push({
      severity: 'info',
      code: TIME_DIAGNOSTIC_CODES.emptyInput,
      message: 'input is empty — enter a Unix timestamp, ISO-8601 string, or date',
    });
    return { instant: null, issues };
  }

  // 1) Bare integer → Unix timestamp (seconds or milliseconds).
  if (INTEGER_RE.test(trimmed)) {
    const n = Number(trimmed);
    const isMs = Math.abs(n) >= SECONDS_MS_BOUNDARY;
    const epochMs = isMs ? n : n * 1000;

    if (!Number.isFinite(epochMs) || Math.abs(epochMs) > JS_DATE_MAX_MS) {
      issues.push({
        severity: 'error',
        code: TIME_DIAGNOSTIC_CODES.outOfRange,
        message: `numeric timestamp ${trimmed} is outside the representable date range`,
      });
      return { instant: null, issues };
    }

    // Always explain the unit choice and show the alternate reading, so
    // the user can tell at a glance if the heuristic guessed wrong.
    const altEpochMs = isMs ? n * 1000 : n;
    const chosenUnit = isMs ? 'milliseconds' : 'seconds';
    const altUnit = isMs ? 'seconds' : 'milliseconds';
    issues.push({
      severity: 'info',
      code: TIME_DIAGNOSTIC_CODES.unitHeuristic,
      message: `read ${trimmed} as Unix ${chosenUnit}; as ${altUnit} it would be ${isoIfInRange(altEpochMs)}`,
    });

    const interpretation: TimeInterpretation = isMs ? 'unix-milliseconds' : 'unix-seconds';
    return { instant: buildInstant(epochMs, interpretation, nowMs), issues };
  }

  // 2) ISO-8601 string → unambiguous.
  if (ISO_RE.test(trimmed)) {
    const ms = Date.parse(trimmed);
    if (Number.isNaN(ms)) {
      issues.push({
        severity: 'error',
        code: TIME_DIAGNOSTIC_CODES.invalidInput,
        message: `"${trimmed}" looks like ISO-8601 but is not a valid date`,
      });
      return { instant: null, issues };
    }
    return { instant: buildInstant(ms, 'iso-8601', nowMs), issues };
  }

  // 3) Anything else the host can parse → a human date string. This path
  // is locale- and runtime-dependent, so it is flagged as ambiguous.
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    issues.push({
      severity: 'error',
      code: TIME_DIAGNOSTIC_CODES.invalidInput,
      message: `"${trimmed}" is not a Unix timestamp, ISO-8601 string, or recognizable date`,
    });
    return { instant: null, issues };
  }
  issues.push({
    severity: 'warning',
    code: TIME_DIAGNOSTIC_CODES.ambiguousInput,
    message: `"${trimmed}" was parsed with the host locale/date parser; the result can vary by locale and runtime — prefer ISO-8601 for unambiguous input`,
  });
  return { instant: buildInstant(ms, 'date-string', nowMs), issues };
}

function buildInstant(
  epochMsRaw: number,
  interpretation: TimeInterpretation,
  nowMs: number,
): TimeInstant {
  const epochMs = Math.trunc(epochMsRaw);
  const date = new Date(epochMs);

  // `+ 0` normalizes negative zero: on a UTC host `-getTimezoneOffset()` is
  // `-0`, which survives in memory but serializes to `0` via JSON — breaking
  // workspace round-trip equality (`-0 !== 0` under toEqual). `+ 0` keeps all
  // real offsets and collapses `-0` to `0`.
  const offsetMinutes = -date.getTimezoneOffset() + 0;
  const local: LocalTimeInfo = {
    formatted: formatLocal(date),
    offsetMinutes,
    offsetLabel: offsetLabel(offsetMinutes),
    timeZone: hostTimeZone(),
  };

  const deltaMs = nowMs - epochMs;
  const relative: RelativeAge = {
    deltaMs,
    isFuture: deltaMs < 0,
    label: relativeLabel(deltaMs),
  };

  return {
    epochMs,
    interpretation,
    iso: date.toISOString(),
    epochSeconds: Math.floor(epochMs / 1000),
    epochMillis: epochMs,
    local,
    relative,
  };
}

function isoIfInRange(ms: number): string {
  if (!Number.isFinite(ms) || Math.abs(ms) > JS_DATE_MAX_MS) return 'out of range';
  return new Date(ms).toISOString();
}

function formatLocal(date: Date): string {
  // `en-US` fixes the *format* (deterministic across runs) while the host
  // zone supplies the wall-clock *value* (the feature). `timeStyle: long`
  // includes the timezone name.
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'long' }).format(date);
}

function hostTimeZone(): string {
  return new Intl.DateTimeFormat('en-US').resolvedOptions().timeZone;
}

function offsetLabel(minutesEast: number): string {
  const sign = minutesEast < 0 ? '-' : '+';
  const abs = Math.abs(minutesEast);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

const REL_UNITS: ReadonlyArray<readonly [string, number]> = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
];

function relativeLabel(deltaMs: number): string {
  const absSeconds = Math.floor(Math.abs(deltaMs) / 1000);
  if (absSeconds < 1) return 'just now';
  for (const [name, seconds] of REL_UNITS) {
    if (absSeconds >= seconds) {
      const n = Math.floor(absSeconds / seconds);
      const unit = `${name}${n === 1 ? '' : 's'}`;
      return deltaMs < 0 ? `in ${n} ${unit}` : `${n} ${unit} ago`;
    }
  }
  return 'just now';
}
