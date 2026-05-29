import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { SEMVER_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  SEMVER_KIND_PARSED,
  type ParsedVersion,
  type SemverArtifact,
  type SemverParsedArtifact,
  type SemverReport,
} from './kinds.js';
import { compareSemver, formatSemver, isValidRange, parseSemver, satisfies, type Semver } from './semver.js';

const TOOL_ID = 'semver';
const PARSER_ID = 'semver.text';

export interface SemverTextParserDeps {
  readonly clock: Clock;
}

function resolveRange(hints: ParserInput['hints']): string | null {
  const r = hints?.range;
  return typeof r === 'string' && r.trim() !== '' ? r.trim() : null;
}

/**
 * The `semver.text` parser. Parses each input line as a semantic version,
 * sorts the valid ones by precedence, and (when `hints.range` is supplied)
 * marks each version's satisfies result. Never throws.
 */
export function createSemverTextParser(deps: SemverTextParserDeps): Parser<SemverArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [SEMVER_KIND_PARSED],
    parse(input: ParserInput): ParserResult<SemverArtifact> {
      return parseSemvers(input, deps.clock.now());
    },
  };
}

function parseSemvers(input: ParserInput, producedAt: string): ParserResult<SemverArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];
  const range = resolveRange(input.hints);

  if (input.raw.trim() === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', SEMVER_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return {
      artifacts: [makeArtifact(artIds(), producedAt, input, { count: 0, range, versions: [], sortedAscending: [] })],
      diagnostics,
    };
  }

  const rangeOk = range === null ? true : isValidRange(range);
  if (range !== null && !rangeOk) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'warning',
        SEMVER_DIAGNOSTIC_CODES.rangeError,
        `range "${range}" could not be parsed`,
      ),
    );
  }

  const lines = input.raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  const versions: ParsedVersion[] = [];
  const valids: Semver[] = [];

  for (const line of lines) {
    const parsed = parseSemver(line);
    if (parsed === null) {
      versions.push({ input: line, valid: false, version: null, components: null, satisfies: null });
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          SEMVER_DIAGNOSTIC_CODES.parseError,
          `"${line}" is not a valid semantic version`,
        ),
      );
      continue;
    }
    valids.push(parsed);
    const sat = range !== null && rangeOk ? satisfies(parsed, range) : null;
    versions.push({
      input: line,
      valid: true,
      version: formatSemver(parsed),
      components: {
        major: parsed.major,
        minor: parsed.minor,
        patch: parsed.patch,
        prerelease: parsed.prerelease.length > 0 ? parsed.prerelease.join('.') : null,
        build: parsed.build,
      },
      satisfies: sat,
    });
  }

  const sortedAscending = [...valids].sort(compareSemver).map(formatSemver);
  const report: SemverReport = { count: versions.length, range, versions, sortedAscending };
  return { artifacts: [makeArtifact(artIds(), producedAt, input, report)], diagnostics };
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: SemverReport,
): SemverParsedArtifact {
  return {
    version: 1,
    kind: SEMVER_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
