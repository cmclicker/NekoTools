import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { DEFAULT_MAX_MATCHES, analyzeFlags, runMatch } from './matcher.js';
import { REGEX_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  REGEX_KIND_SUITE,
  type RegexArtifact,
  type RegexSuite,
  type RegexSuiteArtifact,
  type RegexSuiteCase,
} from './kinds.js';
import { REGEX_TOOL_ID } from './parser-text.js';

export const REGEX_SUITE_PARSER_ID = 'regex.suite';

export interface RegexSuiteParserDeps {
  readonly clock: Clock;
  /** Cap on matches collected per case for a global pattern. Defaults to 10,000. */
  readonly maxMatches?: number;
}

/** A single pasted case before it is run (the shape read from the hint). */
interface RawSuiteCase {
  readonly name?: string;
  readonly pattern: string;
  readonly flags?: string;
  readonly sample: string;
  readonly expectedMatchCount?: number;
}

/**
 * The `regex.suite` parser. Reads a JSON array of test cases from
 * `input.hints.cases` — each `{ name?, pattern, flags?, sample,
 * expectedMatchCount? }` — runs every case through the shared matcher
 * (`analyzeFlags` + `runMatch`, the same core as `regex.match`), and emits a
 * single `regex.suite` artifact summarising pass/fail.
 *
 * The suite is stateless and pasted in: `capabilities.canSaveWorkspace` is
 * false, so nothing is persisted. Never throws — a missing or non-array
 * `cases` hint produces an empty suite plus an error diagnostic; a malformed
 * individual case is coerced (its bad fields default) rather than aborting
 * the run.
 */
export function createRegexSuiteParser(deps: RegexSuiteParserDeps): Parser<RegexArtifact> {
  return {
    version: 1,
    id: REGEX_SUITE_PARSER_ID,
    parserVersion: 1,
    toolId: REGEX_TOOL_ID,
    accepts: ['text'],
    produces: [REGEX_KIND_SUITE],
    parse(input: ParserInput): ParserResult<RegexArtifact> {
      return parseRegexSuite(input, deps);
    },
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Read + shallow-validate one raw case object from the hint array. */
function readRawCase(value: unknown): RawSuiteCase {
  const obj = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const raw: { -readonly [K in keyof RawSuiteCase]: RawSuiteCase[K] } = {
    pattern: asString(obj.pattern),
    sample: asString(obj.sample),
  };
  if (typeof obj.name === 'string') raw.name = obj.name;
  if (typeof obj.flags === 'string') raw.flags = obj.flags;
  if (typeof obj.expectedMatchCount === 'number' && Number.isFinite(obj.expectedMatchCount)) {
    raw.expectedMatchCount = obj.expectedMatchCount;
  }
  return raw;
}

/** Run one raw case through the shared matcher and compute its verdict. */
function runCase(raw: RawSuiteCase, maxMatches: number): RegexSuiteCase {
  const flags = raw.flags ?? '';
  const flagAnalysis = analyzeFlags(flags);

  // Unsupported / duplicate flags would make `new RegExp` throw; treat them as
  // an invalid case (mirrors the regex.match parser's flag handling).
  const flagsBad =
    flagAnalysis.unsupported.length > 0 || flagAnalysis.duplicates.length > 0;
  const outcome = flagsBad
    ? null
    : runMatch(raw.pattern, flagAnalysis.info, raw.sample, maxMatches);

  const valid = outcome?.valid ?? false;
  const error = flagsBad
    ? `unsupported or duplicate flag(s) in "${flags}"`
    : outcome?.error ?? null;
  const matches = outcome?.matches ?? [];
  const matchCount = matches.length;
  const passed =
    raw.expectedMatchCount === undefined ? null : matchCount === raw.expectedMatchCount;

  const result: { -readonly [K in keyof RegexSuiteCase]: RegexSuiteCase[K] } = {
    pattern: raw.pattern,
    flags,
    sample: raw.sample,
    valid,
    error,
    matchCount,
    matches,
    passed,
  };
  if (raw.name !== undefined) result.name = raw.name;
  if (raw.expectedMatchCount !== undefined) result.expectedMatchCount = raw.expectedMatchCount;
  return result;
}

function parseRegexSuite(
  input: ParserInput,
  deps: RegexSuiteParserDeps,
): ParserResult<RegexArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];
  const maxMatches = deps.maxMatches ?? DEFAULT_MAX_MATCHES;

  const rawCases = input.hints?.cases;
  let cases: readonly RegexSuiteCase[] = [];

  if (!Array.isArray(rawCases)) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'error',
        REGEX_DIAGNOSTIC_CODES.suiteInvalid,
        'no test cases supplied; the `cases` hint must be a JSON array of { pattern, sample, flags?, expectedMatchCount? }',
      ),
    );
  } else {
    cases = rawCases.map((c) => runCase(readRawCase(c), maxMatches));
  }

  let passedCount = 0;
  let failedCount = 0;
  for (const c of cases) {
    if (c.passed === true) passedCount += 1;
    else if (c.passed === false) failedCount += 1;
  }

  if (Array.isArray(rawCases) && cases.length === 0) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        REGEX_DIAGNOSTIC_CODES.suiteEmpty,
        'the suite ran with zero cases; add at least one case to test',
      ),
    );
  }

  if (failedCount > 0) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'warning',
        REGEX_DIAGNOSTIC_CODES.suiteFailed,
        `${failedCount} of ${cases.length} case(s) did not meet the expected match count`,
      ),
    );
  }

  const suite: RegexSuite = {
    caseCount: cases.length,
    cases,
    passedCount,
    failedCount,
  };

  const artifact: RegexSuiteArtifact = {
    version: 1,
    kind: REGEX_KIND_SUITE,
    id: artIds(),
    producedBy: {
      toolId: REGEX_TOOL_ID,
      parserId: REGEX_SUITE_PARSER_ID,
      parserVersion: 1,
    },
    producedAt: deps.clock.now(),
    source: input.source,
    value: suite,
  };

  return { artifacts: [artifact], diagnostics };
}
