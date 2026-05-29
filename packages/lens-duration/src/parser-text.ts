import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { DURATION_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import { parseDuration } from './duration.js';
import {
  DURATION_KIND_PARSED,
  type DurationArtifact,
  type DurationEntry,
  type DurationParsedArtifact,
  type DurationReport,
} from './kinds.js';

const TOOL_ID = 'duration';
const PARSER_ID = 'duration.text';

export interface DurationTextParserDeps {
  readonly clock: Clock;
}

/**
 * The `duration.text` parser. Parses each line as an ISO-8601 duration, a
 * humanized string, or bare seconds, emitting total seconds + normalized
 * forms. Never throws; unrecognized input yields a `duration.parse_error`.
 * No network.
 */
export function createDurationTextParser(deps: DurationTextParserDeps): Parser<DurationArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [DURATION_KIND_PARSED],
    parse(input: ParserInput): ParserResult<DurationArtifact> {
      return parseDurations(input, deps.clock.now());
    },
  };
}

function parseDurations(input: ParserInput, producedAt: string): ParserResult<DurationArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  if (input.raw.trim() === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', DURATION_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return { artifacts: [makeArtifact(artIds(), producedAt, input, { count: 0, entries: [] })], diagnostics };
  }

  const lines = input.raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  const entries: DurationEntry[] = [];

  for (const line of lines) {
    const value = parseDuration(line);
    if (value === null) {
      entries.push({ input: line, valid: false, value: null });
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          DURATION_DIAGNOSTIC_CODES.parseError,
          `"${truncate(line)}" is not a recognizable duration`,
        ),
      );
      continue;
    }
    entries.push({ input: line, valid: true, value });
    if (value.approximate) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'info',
          DURATION_DIAGNOSTIC_CODES.approximate,
          `"${line}" uses years/months; totals use average lengths (365.25 d / 30.44 d)`,
        ),
      );
    }
  }

  return { artifacts: [makeArtifact(artIds(), producedAt, input, { count: entries.length, entries })], diagnostics };
}

function truncate(s: string): string {
  return s.length > 50 ? `${s.slice(0, 50)}…` : s;
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: DurationReport,
): DurationParsedArtifact {
  return {
    version: 1,
    kind: DURATION_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
