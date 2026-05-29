import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { transformCase } from './case.js';
import { CASE_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  CASE_KIND_PARSED,
  type CaseArtifact,
  type CaseEntry,
  type CaseParsedArtifact,
  type CaseReport,
} from './kinds.js';

const TOOL_ID = 'case';
const PARSER_ID = 'case.text';

export interface CaseTextParserDeps {
  readonly clock: Clock;
}

/**
 * The `case.text` parser. Tokenizes each input line and renders it in every
 * supported case form. Never throws; a line with no word characters yields
 * a `case.no_words` info and empty forms. No network.
 */
export function createCaseTextParser(deps: CaseTextParserDeps): Parser<CaseArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [CASE_KIND_PARSED],
    parse(input: ParserInput): ParserResult<CaseArtifact> {
      return parseCases(input, deps.clock.now());
    },
  };
}

function parseCases(input: ParserInput, producedAt: string): ParserResult<CaseArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  if (input.raw.trim() === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', CASE_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return { artifacts: [makeArtifact(artIds(), producedAt, input, { count: 0, entries: [] })], diagnostics };
  }

  const lines = input.raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  const entries: CaseEntry[] = [];

  for (const line of lines) {
    const { words, forms } = transformCase(line);
    entries.push({ input: line, words, forms });
    if (words.length === 0) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'info',
          CASE_DIAGNOSTIC_CODES.noWords,
          `"${truncate(line)}" has no word characters to transform`,
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
  value: CaseReport,
): CaseParsedArtifact {
  return {
    version: 1,
    kind: CASE_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
