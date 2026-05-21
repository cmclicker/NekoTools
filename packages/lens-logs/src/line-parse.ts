import { LOG_LEVELS, type LogLevel, type LogLineFormat } from './kinds.js';

/**
 * Per-line parsing for NekoLogs. Each non-empty line is classified as
 * JSON-per-line, logfmt, or plaintext, and lifted into a normalized
 * shape: `{ format, message, level?, timestamp?, timestampMs?, fields }`.
 *
 * This is a deliberately small, conservative scanner — not a literal
 * reuse of NekoEnv's `key=value` scanner (see nekologs.md §7 for why):
 * logfmt quoting differs and an unrecognized logfmt line falls back to
 * plaintext rather than raising a syntax error.
 */

export interface ParsedLine {
  readonly format: LogLineFormat;
  readonly message: string;
  readonly level?: LogLevel;
  readonly timestamp?: string;
  readonly timestampMs?: number;
  readonly fields: Record<string, string>;
  /** True when a leading token looked like a timestamp but did not parse. */
  readonly timestampLookedButFailed: boolean;
  /** True when the line yielded no level, no timestamp, and no fields. */
  readonly unparseable: boolean;
}

const LEVEL_ALIASES: Record<string, LogLevel> = {
  trace: 'trace',
  trc: 'trace',
  debug: 'debug',
  dbg: 'debug',
  info: 'info',
  inf: 'info',
  information: 'info',
  notice: 'info',
  warn: 'warn',
  warning: 'warn',
  wrn: 'warn',
  error: 'error',
  err: 'error',
  severe: 'error',
  fatal: 'fatal',
  crit: 'fatal',
  critical: 'fatal',
  panic: 'fatal',
  emerg: 'fatal',
  emergency: 'fatal',
};

export function normalizeLevel(raw: string | undefined): LogLevel | undefined {
  if (raw === undefined) return undefined;
  const key = raw.trim().toLowerCase();
  if (key === '') return undefined;
  if ((LOG_LEVELS as readonly string[]).includes(key)) return key as LogLevel;
  return LEVEL_ALIASES[key];
}

/** Field keys (case-insensitive) treated as the canonical timestamp/level/message. */
const TIME_KEYS = ['timestamp', 'time', 'ts', '@timestamp', 'date'];
const LEVEL_KEYS = ['level', 'lvl', 'severity', 'loglevel'];
const MSG_KEYS = ['message', 'msg', 'text'];

/**
 * A leading full date is required: `YYYY-MM-DD`, optionally followed by
 * a `T`/space time and an optional fractional + timezone. Bare numbers
 * (`42`), prose, and time-only tokens are NOT timestamps — too
 * ambiguous, and accepting them made `Date.parse` return junk.
 */
const TIMESTAMP_PARSE_SHAPE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Parse a candidate timestamp string. Returns the normalized ISO form
 * and epoch-millis, or null if it does not parse. Accepts ISO-8601 and
 * the common `YYYY-MM-DD HH:MM:SS(.mmm)` form.
 *
 * Determinism: a date-time with **no timezone designator** is treated
 * as **UTC** (a `Z` is appended) so the normalized ISO output does not
 * depend on the machine's local timezone. Without this, the same log
 * would summarize/bucket differently on different machines.
 */
export function parseTimestamp(candidate: string): { iso: string; ms: number } | null {
  const trimmed = candidate.trim();
  if (!TIMESTAMP_PARSE_SHAPE.test(trimmed)) return null;

  // `YYYY-MM-DD HH:MM:SS` (space separator) → insert `T`.
  let normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(trimmed)
    ? trimmed.replace(' ', 'T')
    : trimmed;

  // A date-time with no zone designator is interpreted as UTC.
  const hasTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(normalized);
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized);
  if (hasTime && !hasZone) normalized += 'Z';

  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) return null;
  return { iso: new Date(ms).toISOString(), ms };
}

/** Looks-like-a-timestamp shape test (used to flag failed parses). */
const TIMESTAMP_SHAPE = /^(?:\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\S*|\d{2}:\d{2}:\d{2}\S*)/;

export function parseLine(raw: string): ParsedLine {
  const trimmed = raw.trim();

  // 1. JSON-per-line.
  if (trimmed.startsWith('{')) {
    const json = tryParseJsonObject(trimmed);
    if (json) return fromJsonObject(json);
  }

  // 2. logfmt — the whole line is a run of key=value pairs.
  if (isLogfmtLine(trimmed)) {
    return fromLogfmt(trimmed);
  }

  // 3. plaintext fallback.
  return fromPlain(raw);
}

function tryParseJsonObject(s: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(s);
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

function fromJsonObject(obj: Record<string, unknown>): ParsedLine {
  const fields: Record<string, string> = {};
  let message = '';
  let level: LogLevel | undefined;
  let timestamp: string | undefined;
  let timestampMs: number | undefined;
  let timestampLookedButFailed = false;

  for (const [key, value] of Object.entries(obj)) {
    const lk = key.toLowerCase();
    const sval = stringifyScalar(value);
    if (MSG_KEYS.includes(lk) && message === '') {
      message = sval;
    } else if (LEVEL_KEYS.includes(lk) && level === undefined) {
      level = normalizeLevel(sval);
      if (level === undefined && sval !== '') fields[key] = sval;
    } else if (TIME_KEYS.includes(lk) && timestamp === undefined) {
      const ts = parseTimestamp(sval);
      if (ts) {
        timestamp = ts.iso;
        timestampMs = ts.ms;
      } else if (sval !== '') {
        timestampLookedButFailed = true;
        fields[key] = sval;
      }
    } else {
      fields[key] = sval;
    }
  }

  // If there was no message key, fall back to the whole object's
  // remaining content being effectively the message-less structured
  // entry; keep message empty rather than inventing one.
  const result: ParsedLine = {
    format: 'json',
    message,
    fields,
    timestampLookedButFailed,
    unparseable: false, // structured JSON is never "unparseable"
    ...(level !== undefined && { level }),
    ...(timestamp !== undefined && { timestamp }),
    ...(timestampMs !== undefined && { timestampMs }),
  };
  return result;
}

const LOGFMT_PAIR = /[A-Za-z_][\w.-]*=(?:"(?:[^"\\]|\\.)*"|[^\s"]*)/g;
const LOGFMT_LINE = /^(?:\s*[A-Za-z_][\w.-]*=(?:"(?:[^"\\]|\\.)*"|[^\s"]*)\s*)+$/;

function isLogfmtLine(s: string): boolean {
  if (s === '') return false;
  // Require the whole line to be key=value pairs, and at least one pair
  // to carry a recognized key — otherwise `a=b` plain prose would be
  // misread. We accept it as logfmt if it structurally matches AND has
  // >= 2 pairs or a known key.
  if (!LOGFMT_LINE.test(s)) return false;
  const pairs = s.match(LOGFMT_PAIR) ?? [];
  if (pairs.length === 0) return false;
  if (pairs.length >= 2) return true;
  const key = pairs[0]!.split('=')[0]!.toLowerCase();
  return (
    MSG_KEYS.includes(key) || LEVEL_KEYS.includes(key) || TIME_KEYS.includes(key)
  );
}

function fromLogfmt(s: string): ParsedLine {
  const pairs = s.match(LOGFMT_PAIR) ?? [];
  const fields: Record<string, string> = {};
  let message = '';
  let level: LogLevel | undefined;
  let timestamp: string | undefined;
  let timestampMs: number | undefined;
  let timestampLookedButFailed = false;

  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    const key = pair.slice(0, eq);
    const rawValue = pair.slice(eq + 1);
    const value = unquoteLogfmt(rawValue);
    const lk = key.toLowerCase();
    if (MSG_KEYS.includes(lk) && message === '') {
      message = value;
    } else if (LEVEL_KEYS.includes(lk) && level === undefined) {
      level = normalizeLevel(value);
      if (level === undefined && value !== '') fields[key] = value;
    } else if (TIME_KEYS.includes(lk) && timestamp === undefined) {
      const ts = parseTimestamp(value);
      if (ts) {
        timestamp = ts.iso;
        timestampMs = ts.ms;
      } else if (value !== '') {
        timestampLookedButFailed = true;
        fields[key] = value;
      }
    } else {
      fields[key] = value;
    }
  }

  return {
    format: 'logfmt',
    message,
    fields,
    timestampLookedButFailed,
    unparseable: false,
    ...(level !== undefined && { level }),
    ...(timestamp !== undefined && { timestamp }),
    ...(timestampMs !== undefined && { timestampMs }),
  };
}

function unquoteLogfmt(v: string): string {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return v;
}

const LEADING_BRACKET_LEVEL = /^\[(\w+)\]\s*/;
const LEADING_PREFIX_LEVEL = /^(\w+):\s+/;

function fromPlain(raw: string): ParsedLine {
  let rest = raw.trim();
  let level: LogLevel | undefined;
  let timestamp: string | undefined;
  let timestampMs: number | undefined;
  let timestampLookedButFailed = false;

  // Leading timestamp.
  const tsMatch = TIMESTAMP_SHAPE.exec(rest);
  if (tsMatch) {
    const ts = parseTimestamp(tsMatch[0]);
    if (ts) {
      timestamp = ts.iso;
      timestampMs = ts.ms;
      rest = rest.slice(tsMatch[0].length).trim();
    } else {
      timestampLookedButFailed = true;
    }
  }

  // Leading `[LEVEL]` or `LEVEL:` token.
  const bracket = LEADING_BRACKET_LEVEL.exec(rest);
  if (bracket) {
    const lvl = normalizeLevel(bracket[1]);
    if (lvl) {
      level = lvl;
      rest = rest.slice(bracket[0].length);
    }
  }
  if (level === undefined) {
    const prefix = LEADING_PREFIX_LEVEL.exec(rest);
    if (prefix) {
      const lvl = normalizeLevel(prefix[1]);
      if (lvl) {
        level = lvl;
        rest = rest.slice(prefix[0].length);
      }
    }
  }

  const message = rest;
  const unparseable = level === undefined && timestamp === undefined;

  return {
    format: 'plain',
    message,
    fields: {},
    timestampLookedButFailed,
    unparseable,
    ...(level !== undefined && { level }),
    ...(timestamp !== undefined && { timestamp }),
    ...(timestampMs !== undefined && { timestampMs }),
  };
}

function stringifyScalar(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // Arrays / nested objects are JSON-stringified so the field stays a string.
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
