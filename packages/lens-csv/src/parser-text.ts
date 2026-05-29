import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import {
  CSV_DIAGNOSTIC_CODES,
  DEFAULT_LARGE_DOCUMENT_BYTES,
  makeDiagnostic,
} from './diagnostics.js';
import {
  CSV_KIND_TABLE,
  type CsvArtifact,
  type CsvDelimiter,
  type CsvRow,
  type CsvTableArtifact,
  type CsvTableDocument,
} from './kinds.js';

const TOOL_ID = 'csv';
const PARSER_ID = 'csv.text';

export interface CsvParserHints {
  readonly delimiter?: CsvDelimiter;
  readonly hasHeader?: boolean;
}

export interface CsvParserDeps {
  readonly clock: Clock;
  readonly largeDocumentBytes?: number;
}

interface ParsedRecord {
  readonly line: number;
  readonly cells: readonly string[];
}

interface DelimitedParseResult {
  readonly records: readonly ParsedRecord[];
  readonly diagnostics: readonly Diagnostic[];
}

export function createCsvTextParser(deps: CsvParserDeps): Parser<CsvArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['csv', 'tsv', 'text'],
    produces: [CSV_KIND_TABLE],
    parse(input: ParserInput): ParserResult<CsvArtifact> {
      return parseCsv(input, deps);
    },
  };
}

function parseCsv(input: ParserInput, deps: CsvParserDeps): ParserResult<CsvArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];
  const hints = readHints(input.hints);
  const delimiterChar = hints.delimiter === 'tab' ? '\t' : ',';
  const bytes = utf8ByteLength(input.raw);

  if (input.raw.trim() === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', CSV_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
  }

  const threshold = deps.largeDocumentBytes ?? DEFAULT_LARGE_DOCUMENT_BYTES;
  if (bytes > threshold) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        CSV_DIAGNOSTIC_CODES.largeDocument,
        `CSV input is ${bytes} bytes; exceeds soft threshold of ${threshold} bytes`,
      ),
    );
  }

  const parsed = parseDelimited(input.raw, delimiterChar, diagIds);
  diagnostics.push(...parsed.diagnostics);

  const document = documentFromRecords(parsed.records, hints, diagnostics, diagIds);
  const artifact: CsvTableArtifact = {
    version: 1,
    kind: CSV_KIND_TABLE,
    id: artIds(),
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt: deps.clock.now(),
    source: input.source,
    value: {
      ...document,
      valid: document.valid && !parsed.diagnostics.some((d) => d.severity === 'error'),
    },
  };

  return { artifacts: [artifact], diagnostics };
}

function parseDelimited(raw: string, delimiter: string, diagIds: () => string): DelimitedParseResult {
  const records: ParsedRecord[] = [];
  const diagnostics: Diagnostic[] = [];
  let cells: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const endField = (): void => {
    cells.push(field);
    field = '';
  };
  const endRecord = (): void => {
    endField();
    records.push({ line: recordLine, cells });
    cells = [];
    recordLine = line + 1;
  };

  for (let index = 0; index < raw.length; index += 1) {
    const ch = raw.charAt(index);

    if (inQuotes) {
      if (ch === '"' && raw.charAt(index + 1) === '"') {
        field += '"';
        index += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else if (ch === '\r') {
        if (raw.charAt(index + 1) === '\n') index += 1;
        field += '\n';
        line += 1;
      } else {
        field += ch;
        if (ch === '\n') line += 1;
      }
      continue;
    }

    if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === '\r') {
      endRecord();
      if (raw.charAt(index + 1) === '\n') index += 1;
      line += 1;
    } else if (ch === '\n') {
      endRecord();
      line += 1;
    } else {
      field += ch;
    }
  }

  if (inQuotes) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'error',
        CSV_DIAGNOSTIC_CODES.unclosedQuote,
        'quoted field was not closed before end of input',
      ),
    );
  }

  if (raw.length > 0 && !raw.endsWith('\n') && !raw.endsWith('\r')) {
    endRecord();
  }

  return { records, diagnostics };
}

function documentFromRecords(
  records: readonly ParsedRecord[],
  hints: Required<CsvParserHints>,
  diagnostics: Diagnostic[],
  diagIds: () => string,
): CsvTableDocument {
  const headerRecord = hints.hasHeader ? records[0] : undefined;
  const dataRecords = hints.hasHeader ? records.slice(1) : records;
  const columnCount = Math.max(
    headerRecord?.cells.length ?? 0,
    ...dataRecords.map((record) => record.cells.length),
    0,
  );
  const headerColumns =
    headerRecord !== undefined ? normalizeHeaders(headerRecord.cells, diagnostics, diagIds) : [];
  const columns =
    headerRecord !== undefined
      ? extendColumns(headerColumns, columnCount)
      : Array.from({ length: columnCount }, (_, index) => `column_${index + 1}`);

  for (const record of dataRecords) {
    if (record.cells.length !== columnCount) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          CSV_DIAGNOSTIC_CODES.inconsistentColumns,
          `row starting on line ${record.line} has ${record.cells.length} cells; expected ${columnCount}`,
        ),
      );
    }
  }

  const rows = dataRecords.map((record) => rowFromRecord(record, columns));
  const emptyCellCount = rows.reduce(
    (count, row) => count + row.cells.filter((cell) => cell === '').length,
    0,
  );

  return {
    valid: true,
    delimiter: hints.delimiter,
    hasHeader: hints.hasHeader,
    columns,
    rows,
    rowCount: rows.length,
    columnCount,
    emptyCellCount,
  };
}

function normalizeHeaders(
  headers: readonly string[],
  diagnostics: Diagnostic[],
  diagIds: () => string,
): readonly string[] {
  const seen = new Map<string, number>();
  return headers.map((header, index) => {
    const trimmed = header.trim();
    const name = trimmed === '' ? `column_${index + 1}` : trimmed;
    if (trimmed === '') {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          CSV_DIAGNOSTIC_CODES.emptyHeader,
          `header ${index + 1} is empty; using ${name}`,
        ),
      );
    }

    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count > 0) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          CSV_DIAGNOSTIC_CODES.duplicateHeader,
          `header "${name}" appears more than once`,
        ),
      );
      return `${name}_${count + 1}`;
    }
    return name;
  });
}

function extendColumns(columns: readonly string[], columnCount: number): readonly string[] {
  if (columns.length >= columnCount) return columns;
  return [
    ...columns,
    ...Array.from({ length: columnCount - columns.length }, (_, index) => {
      return `column_${columns.length + index + 1}`;
    }),
  ];
}

function rowFromRecord(record: ParsedRecord, columns: readonly string[]): CsvRow {
  const cells = padCells(record.cells, columns.length);
  const entries = columns.map((column, index) => [column, cells[index] ?? ''] as const);
  return { line: record.line, cells, record: Object.fromEntries(entries) };
}

function padCells(cells: readonly string[], length: number): readonly string[] {
  if (cells.length >= length) return cells;
  return [...cells, ...Array.from({ length: length - cells.length }, () => '')];
}

function readHints(hints: ParserInput['hints']): Required<CsvParserHints> {
  const delimiter = isRecord(hints) && hints['delimiter'] === 'tab' ? 'tab' : 'comma';
  const hasHeader = isRecord(hints) && typeof hints['hasHeader'] === 'boolean'
    ? hints['hasHeader']
    : true;
  return { delimiter, hasHeader };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const SHARED_UTF8_ENCODER = new TextEncoder();
function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}
