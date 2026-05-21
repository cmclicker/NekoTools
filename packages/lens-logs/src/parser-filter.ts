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
      const filter = (input.hints?.['filter'] ?? {}) as LogFilter;

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

      const validationError = validateFilter(filter);
      if (validationError !== null) {
        return {
          artifacts: [],
          diagnostics: [
            makeDiagnostic(
              diagIds(),
              'error',
              LOG_DIAGNOSTIC_CODES.filterInvalid,
              validationError,
            ),
          ],
        };
      }

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

function validateFilter(filter: LogFilter): string | null {
  if (filter.minLevel !== undefined && !isLevel(filter.minLevel)) {
    return `minLevel "${String(filter.minLevel)}" is not a known level (${LOG_LEVELS.join(', ')})`;
  }
  if (filter.levelIn !== undefined) {
    if (!Array.isArray(filter.levelIn) || filter.levelIn.some((l) => !isLevel(l))) {
      return `levelIn must be an array of known levels (${LOG_LEVELS.join(', ')})`;
    }
  }
  if (filter.since !== undefined && parseTimestamp(filter.since) === null) {
    return `since "${filter.since}" is not a parseable timestamp`;
  }
  if (filter.until !== undefined && parseTimestamp(filter.until) === null) {
    return `until "${filter.until}" is not a parseable timestamp`;
  }
  if (
    filter.fieldEquals !== undefined &&
    (typeof filter.fieldEquals.key !== 'string' || typeof filter.fieldEquals.value !== 'string')
  ) {
    return 'fieldEquals must be { key: string, value: string }';
  }
  return null;
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
