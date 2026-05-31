import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { SORT_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import { SORT_KIND_PARSED, type SortArtifact, type SortParsedArtifact, type SortReport } from './kinds.js';
import { DEFAULT_OPTIONS, transformLines, type SortOptions, type SortOrder } from './sort.js';

const TOOL_ID = 'sort';
const PARSER_ID = 'sort.text';

export interface SortTextParserDeps {
  readonly clock: Clock;
}

function bool(hints: ParserInput['hints'], key: string): boolean | undefined {
  const v = hints?.[key];
  return typeof v === 'boolean' ? v : undefined;
}

function resolveOptions(hints: ParserInput['hints']): SortOptions {
  const order = hints?.order;
  return {
    order: order === 'asc' || order === 'desc' || order === 'original' ? (order as SortOrder) : DEFAULT_OPTIONS.order,
    unique: bool(hints, 'unique') ?? DEFAULT_OPTIONS.unique,
    caseInsensitive: bool(hints, 'caseInsensitive') ?? DEFAULT_OPTIONS.caseInsensitive,
    numeric: bool(hints, 'numeric') ?? DEFAULT_OPTIONS.numeric,
    trimLines: bool(hints, 'trimLines') ?? DEFAULT_OPTIONS.trimLines,
    removeBlank: bool(hints, 'removeBlank') ?? DEFAULT_OPTIONS.removeBlank,
  };
}

/**
 * The `sort.text` parser. Sorts / dedupes / trims the input lines per the
 * options in `hints` and reports the result. Never throws; no network.
 */
export function createSortTextParser(deps: SortTextParserDeps): Parser<SortArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [SORT_KIND_PARSED],
    parse(input: ParserInput): ParserResult<SortArtifact> {
      return parseSort(input, deps.clock.now());
    },
  };
}

function parseSort(input: ParserInput, producedAt: string): ParserResult<SortArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];
  const options = resolveOptions(input.hints);

  if (input.raw.trim() === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', SORT_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return {
      artifacts: [makeArtifact(artIds(), producedAt, input, { options, inputCount: 0, outputCount: 0, removed: 0, lines: [], inputLines: [] })],
      diagnostics,
    };
  }

  // The original input lines, before transform — retained for the Pro diff
  // exporter. Mirrors transformLines' own `raw.split(/\r?\n/)`.
  const inputLines = input.raw.split(/\r?\n/);
  const result = transformLines(input.raw, options);
  if (result.removed > 0) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        SORT_DIAGNOSTIC_CODES.removedLines,
        `${result.removed} line(s) removed (dedupe / blank removal)`,
      ),
    );
  }

  const report: SortReport = {
    options,
    inputCount: result.inputCount,
    outputCount: result.outputCount,
    removed: result.removed,
    lines: result.lines,
    inputLines,
  };
  return { artifacts: [makeArtifact(artIds(), producedAt, input, report)], diagnostics };
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: SortReport,
): SortParsedArtifact {
  return {
    version: 1,
    kind: SORT_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
