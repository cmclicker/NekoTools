import type { Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { makeDiagnostic } from './diagnostics.js';
import { resolveTimeInput } from './resolve.js';
import { TIME_KIND_INSTANT, type TimeArtifact, type TimeInstantArtifact } from './kinds.js';

const TOOL_ID = 'time';
const PARSER_ID = 'time.parse';

export interface TimeParserDeps {
  readonly clock: Clock;
}

/**
 * The `time.parse` parser. Reads a single raw value — Unix seconds, Unix
 * milliseconds, an ISO-8601 string, or a host-parseable date string — and
 * emits one `time.instant` artifact (or none, with diagnostics, on empty
 * / invalid / out-of-range input). Never throws.
 *
 * "Now" for the relative-age field comes only from the injected clock
 * (`deps.clock.now()`), never `new Date()`, so a fixed clock makes the
 * entire output reproducible (the lens-kit determinism rule).
 */
export function createTimeParser(deps: TimeParserDeps): Parser<TimeArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text', 'time', 'timestamp', 'date'],
    produces: [TIME_KIND_INSTANT],
    parse(input: ParserInput): ParserResult<TimeArtifact> {
      const diagIds = makeIdFactory('diag');
      const artIds = makeIdFactory('art');
      const nowMs = Date.parse(deps.clock.now());

      const { instant, issues } = resolveTimeInput(input.raw, nowMs);
      const diagnostics = issues.map((issue) =>
        makeDiagnostic(diagIds(), issue.severity, issue.code, issue.message),
      );

      if (instant === null) {
        return { artifacts: [], diagnostics };
      }

      const artifact: TimeInstantArtifact = {
        version: 1,
        kind: TIME_KIND_INSTANT,
        id: artIds(),
        producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
        producedAt: deps.clock.now(),
        source: input.source,
        value: instant,
      };
      return { artifacts: [artifact], diagnostics };
    },
  };
}
