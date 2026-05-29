import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { UNICODE_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  UNICODE_KIND_PARSED,
  type UnicodeArtifact,
  type UnicodeParsedArtifact,
  type UnicodeReport,
} from './kinds.js';
import { scanUnicode } from './unicode.js';

const TOOL_ID = 'unicode';
const PARSER_ID = 'unicode.text';
const DEFAULT_LIMIT = 500;

export interface UnicodeTextParserDeps {
  readonly clock: Clock;
  /** Cap on per-codepoint detail entries. Defaults to 500. */
  readonly limit?: number;
}

/**
 * The `unicode.text` parser. Breaks the input into code points and
 * describes each. Whitespace is meaningful (it has code points), so only a
 * truly empty string is treated as empty. Never throws; no network.
 */
export function createUnicodeTextParser(deps: UnicodeTextParserDeps): Parser<UnicodeArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [UNICODE_KIND_PARSED],
    parse(input: ParserInput): ParserResult<UnicodeArtifact> {
      return parseUnicode(input, deps.clock.now(), deps.limit ?? DEFAULT_LIMIT);
    },
  };
}

function parseUnicode(input: ParserInput, producedAt: string, limit: number): ParserResult<UnicodeArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  if (input.raw === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', UNICODE_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return {
      artifacts: [
        makeArtifact(artIds(), producedAt, input, {
          codepointCount: 0,
          utf16UnitCount: 0,
          byteLength: 0,
          codepoints: [],
          truncated: false,
        }),
      ],
      diagnostics,
    };
  }

  const scan = scanUnicode(input.raw, limit);
  if (scan.truncated) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        UNICODE_DIAGNOSTIC_CODES.truncated,
        `showing the first ${limit} of ${scan.codepointCount} code points`,
      ),
    );
  }
  if (scan.codepoints.some((c) => c.isControl)) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        UNICODE_DIAGNOSTIC_CODES.control,
        'input contains control characters',
      ),
    );
  }

  return { artifacts: [makeArtifact(artIds(), producedAt, input, scan)], diagnostics };
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: UnicodeReport,
): UnicodeParsedArtifact {
  return {
    version: 1,
    kind: UNICODE_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
