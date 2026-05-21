import type { Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { LOG_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  LOG_KIND_FILTER_RESULT,
  LOG_LEVEL_RANK,
  LOG_LEVELS,
  type LogArtifact,
  type LogDocument,
  type LogEntry,
  type LogFilter,
  type LogFilterResultArtifact,
  type LogLevel,
} from './kinds.js';
import { parseTimestamp } from './line-parse.js';

const TOOL_ID = 'logs';
const PARSER_ID = 'log.filter';

interface ParserDeps {
  readonly clock: Clock;
}

/**
 * `log.filter` — applies a structured filter (passed via
 * `input.hints.filter`) to a loaded `log.document` (via
 * `input.hints.document`), producing a `log.filter-result`. The filter
 * is a plain object, never a parsed query string — NekoLogs executes
 * no query DSL. All present predicates combine with AND.
 *
 * Invalid filters (unknown level, unparseable since/until) produce a
 * `log.filter.invalid` error and no artifact — the fail-closed pattern
 * NekoEnv's `env.diff.textual` uses for bad input.
 */
export function createLogFilterParser(deps: ParserDeps): Parser<LogArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['log.filter'],
    produces: [LOG_KIND_FILTER_RESULT],
    parse(input: ParserInput): ParserResult<LogArtifact> {
      const artIds = makeIdFactory('art');
      const diagIds = makeIdFactory('diag');

      const documentArtifactId =
        typeof input.hints?.['documentArtifactId'] === 'string'
          ? (input.hints['documentArtifactId'] as string)
          : 'unknown';
      const document = input.hints?.['document'] as LogDocument | undefined;
      // Distinguish "filter hint absent" (default to match-all `{}`)
      // from "filter hint present but null/garbage" (invalid). Using
      // `?? {}` would collapse an explicit `null` into match-all, which
      // would hide a malformed input — so check presence explicitly.
      const hints = input.hints;
      const rawFilter: unknown =
        hints !== undefined && Object.prototype.hasOwnProperty.call(hints, 'filter')
          ? hints['filter']
          : {};

      if (!document || !Array.isArray(document.entries)) {
        return {
          artifacts: [],
          diagnostics: [
            makeDiagnostic(
              diagIds(),
              'error',
              LOG_DIAGNOSTIC_CODES.filterInvalid,
              'log.filter requires hints.document (a LogDocument)',
            ),
          ],
        };
      }

      // Fully validate the untrusted filter before touching any field.
      // `validateFilter` accepts `unknown` and never throws — malformed
      // hints become a `log.filter.invalid` diagnostic, never an
      // exception (PR #16 audit blocker).
      const validation = validateFilter(rawFilter);
      if (!validation.ok) {
        return {
          artifacts: [],
          diagnostics: [
            makeDiagnostic(
              diagIds(),
              'error',
              LOG_DIAGNOSTIC_CODES.filterInvalid,
              validation.error,
            ),
          ],
        };
      }

      const filter = validation.filter;
      const predicate = compileFilter(filter);
      const matched = document.entries.filter(predicate);

      const artifact: LogFilterResultArtifact = {
        version: 1,
        kind: LOG_KIND_FILTER_RESULT,
        id: artIds(),
        producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
        producedAt: deps.clock.now(),
        source: { kind: 'derived', from: [documentArtifactId] },
        value: {
          documentArtifactId,
          filter,
          entries: matched,
          matchedCount: matched.length,
          totalCount: document.entries.length,
        },
      };
      return { artifacts: [artifact], diagnostics: [] };
    },
  };
}

function isLevel(v: unknown): v is LogLevel {
  return typeof v === 'string' && (LOG_LEVELS as readonly string[]).includes(v);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

type FilterValidation =
  | { readonly ok: true; readonly filter: LogFilter }
  | { readonly ok: false; readonly error: string };

/**
 * Validate an **untrusted** filter object coming from `input.hints`.
 * Accepts `unknown` and never throws — every malformed shape returns a
 * descriptive error instead. On success, returns a normalized
 * `LogFilter` containing only the recognized, type-checked fields
 * (unknown keys are dropped). `compileFilter` may only run on a
 * value this function approved.
 */
function validateFilter(raw: unknown): FilterValidation {
  if (!isRecord(raw)) {
    return { ok: false, error: 'filter must be a non-null object' };
  }

  const out: { -readonly [K in keyof LogFilter]?: LogFilter[K] } = {};

  if (raw['minLevel'] !== undefined) {
    if (!isLevel(raw['minLevel'])) {
      return {
        ok: false,
        error: `minLevel "${String(raw['minLevel'])}" is not a known level (${LOG_LEVELS.join(', ')})`,
      };
    }
    out.minLevel = raw['minLevel'];
  }

  if (raw['levelIn'] !== undefined) {
    const lvls = raw['levelIn'];
    if (!Array.isArray(lvls) || lvls.some((l) => !isLevel(l))) {
      return {
        ok: false,
        error: `levelIn must be an array of known levels (${LOG_LEVELS.join(', ')})`,
      };
    }
    out.levelIn = lvls as LogLevel[];
  }

  if (raw['messageContains'] !== undefined) {
    if (typeof raw['messageContains'] !== 'string') {
      return { ok: false, error: 'messageContains must be a string' };
    }
    out.messageContains = raw['messageContains'];
  }

  if (raw['fieldEquals'] !== undefined) {
    const fe = raw['fieldEquals'];
    if (!isRecord(fe) || typeof fe['key'] !== 'string' || typeof fe['value'] !== 'string') {
      return { ok: false, error: 'fieldEquals must be { key: string, value: string }' };
    }
    out.fieldEquals = { key: fe['key'], value: fe['value'] };
  }

  if (raw['since'] !== undefined) {
    if (typeof raw['since'] !== 'string' || parseTimestamp(raw['since']) === null) {
      return { ok: false, error: `since "${String(raw['since'])}" is not a parseable timestamp` };
    }
    out.since = raw['since'];
  }

  if (raw['until'] !== undefined) {
    if (typeof raw['until'] !== 'string' || parseTimestamp(raw['until']) === null) {
      return { ok: false, error: `until "${String(raw['until'])}" is not a parseable timestamp` };
    }
    out.until = raw['until'];
  }

  return { ok: true, filter: out as LogFilter };
}

function compileFilter(filter: LogFilter): (e: LogEntry) => boolean {
  const sinceMs = filter.since ? parseTimestamp(filter.since)?.ms ?? null : null;
  const untilMs = filter.until ? parseTimestamp(filter.until)?.ms ?? null : null;
  const needle = filter.messageContains?.toLowerCase();
  const levelSet = filter.levelIn ? new Set(filter.levelIn) : null;

  return (e: LogEntry): boolean => {
    if (filter.minLevel !== undefined) {
      if (e.level === undefined) return false;
      if (LOG_LEVEL_RANK[e.level] < LOG_LEVEL_RANK[filter.minLevel]) return false;
    }
    if (levelSet !== null) {
      if (e.level === undefined || !levelSet.has(e.level)) return false;
    }
    if (needle !== undefined && !e.message.toLowerCase().includes(needle)) {
      return false;
    }
    if (filter.fieldEquals !== undefined) {
      if (e.fields[filter.fieldEquals.key] !== filter.fieldEquals.value) return false;
    }
    if (sinceMs !== null) {
      if (typeof e.timestampMs !== 'number' || e.timestampMs < sinceMs) return false;
    }
    if (untilMs !== null) {
      if (typeof e.timestampMs !== 'number' || e.timestampMs > untilMs) return false;
    }
    return true;
  };
}
