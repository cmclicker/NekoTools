import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { DEFAULT_MAX_MATCHES, analyzeFlags, runMatch } from './matcher.js';
import {
  REGEX_DIAGNOSTIC_CODES,
  detectExpensivePattern,
  makeDiagnostic,
} from './diagnostics.js';
import {
  REGEX_KIND_MATCHSET,
  type RegexArtifact,
  type RegexMatch,
  type RegexMatchSet,
  type RegexMatchSetArtifact,
} from './kinds.js';

export const REGEX_TOOL_ID = 'regex';
export const REGEX_PARSER_ID = 'regex.match';

export interface RegexMatchParserDeps {
  readonly clock: Clock;
  /** Cap on matches collected for a global pattern. Defaults to 10,000. */
  readonly maxMatches?: number;
}

/**
 * The `regex.match` parser. Reads the pattern + flags from
 * `input.hints.{pattern,flags}` and runs them over `input.raw` (the sample
 * text), emitting a single `regex.matchset` artifact plus structured
 * diagnostics. Never throws — an invalid pattern or bad flags produce an
 * error diagnostic and a best-effort (`valid: false`) artifact.
 */
export function createRegexMatchParser(deps: RegexMatchParserDeps): Parser<RegexArtifact> {
  return {
    version: 1,
    id: REGEX_PARSER_ID,
    parserVersion: 1,
    toolId: REGEX_TOOL_ID,
    accepts: ['text'],
    produces: [REGEX_KIND_MATCHSET],
    parse(input: ParserInput): ParserResult<RegexArtifact> {
      return parseRegexMatch(input, deps);
    },
  };
}

function readHint(input: ParserInput, key: string): string {
  const value = input.hints?.[key];
  return typeof value === 'string' ? value : '';
}

function parseRegexMatch(
  input: ParserInput,
  deps: RegexMatchParserDeps,
): ParserResult<RegexArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  const pattern = readHint(input, 'pattern');
  const flags = readHint(input, 'flags');
  const sample = input.raw;
  const maxMatches = deps.maxMatches ?? DEFAULT_MAX_MATCHES;

  const flagAnalysis = analyzeFlags(flags);

  let valid: boolean;
  let error: string | null;
  let matches: readonly RegexMatch[];
  let truncated: boolean;
  let groupCount: number;
  let namedGroupNames: readonly string[];

  // Unsupported / duplicate flags would make `new RegExp` throw; classify
  // them precisely instead of letting them surface as a generic syntax error.
  if (flagAnalysis.unsupported.length > 0 || flagAnalysis.duplicates.length > 0) {
    const parts: string[] = [];
    if (flagAnalysis.unsupported.length > 0) {
      parts.push(`unsupported flag(s): ${flagAnalysis.unsupported.join(', ')}`);
    }
    if (flagAnalysis.duplicates.length > 0) {
      parts.push(`duplicate flag(s): ${flagAnalysis.duplicates.join(', ')}`);
    }
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'error',
        REGEX_DIAGNOSTIC_CODES.unsupportedFlag,
        `${parts.join('; ')}. Native RegExp flags are: d g i m s u v y.`,
      ),
    );
    valid = false;
    error = null;
    matches = [];
    truncated = false;
    groupCount = 0;
    namedGroupNames = [];
  } else {
    const outcome = runMatch(pattern, flagAnalysis.info, sample, maxMatches);
    valid = outcome.valid;
    error = outcome.error;
    matches = outcome.matches;
    truncated = outcome.truncated;
    groupCount = outcome.groupCount;
    namedGroupNames = outcome.namedGroupNames;
    if (!valid && error !== null) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'error',
          REGEX_DIAGNOSTIC_CODES.invalidPattern,
          `invalid regular expression: ${error}`,
        ),
      );
    }
  }

  if (pattern === '') {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        REGEX_DIAGNOSTIC_CODES.emptyPattern,
        'pattern is empty; an empty pattern matches at every position',
      ),
    );
  }
  if (sample === '') {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        REGEX_DIAGNOSTIC_CODES.emptySample,
        'sample text is empty; there is nothing to match against',
      ),
    );
  }

  const expensive = detectExpensivePattern(pattern);
  if (expensive !== null) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'warning',
        REGEX_DIAGNOSTIC_CODES.expensivePattern,
        expensive,
        undefined,
        'simplify nested quantifiers or anchor the pattern to limit backtracking',
      ),
    );
  }

  if (truncated) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'warning',
        REGEX_DIAGNOSTIC_CODES.matchLimit,
        `match list truncated at the ${maxMatches}-match limit`,
      ),
    );
  }

  if (valid && pattern !== '' && sample !== '' && matches.length === 0) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        REGEX_DIAGNOSTIC_CODES.noMatches,
        'the pattern is valid but produced no matches in the sample',
      ),
    );
  }

  const matchSet: RegexMatchSet = {
    pattern,
    flags: flagAnalysis.info,
    valid,
    error,
    matchCount: matches.length,
    matches,
    groupCount,
    namedGroupNames,
    truncated,
    sampleBytes: utf8ByteLength(sample),
  };

  const artifact: RegexMatchSetArtifact = {
    version: 1,
    kind: REGEX_KIND_MATCHSET,
    id: artIds(),
    producedBy: { toolId: REGEX_TOOL_ID, parserId: REGEX_PARSER_ID, parserVersion: 1 },
    producedAt: deps.clock.now(),
    source: input.source,
    value: matchSet,
  };

  return { artifacts: [artifact], diagnostics };
}

const SHARED_UTF8_ENCODER = new TextEncoder();
function utf8ByteLength(s: string): number {
  return SHARED_UTF8_ENCODER.encode(s).byteLength;
}
