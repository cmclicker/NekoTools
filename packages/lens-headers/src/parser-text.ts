import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import {
  DEFAULT_LARGE_DOCUMENT_BYTES,
  HEADERS_DIAGNOSTIC_CODES,
  SECURITY_HINTS,
  makeDiagnostic,
} from './diagnostics.js';
import {
  HEADERS_KIND_DOCUMENT,
  type HeaderEntry,
  type HeadersArtifact,
  type HeadersDocument,
  type HeadersDocumentArtifact,
} from './kinds.js';

const TOOL_ID = 'headers';
const PARSER_ID = 'headers.text';

/** A leading status line (`HTTP/1.1 200 OK`) or request line
 * (`GET /path HTTP/1.1`). Used to skip the start line so it is not
 * reported as a malformed header. */
const START_LINE_REGEX = /^(?:HTTP\/\d|[A-Z]+\s+\S+\s+HTTP\/\d)/;

export interface HeadersTextParserDeps {
  readonly clock: Clock;
  readonly largeDocumentBytes?: number;
}

/**
 * The `headers.text` parser. Accepts a raw HTTP header block (one
 * `Name: value` per line, optional leading request/status line) and
 * produces a `headers.document`. Never throws — malformed lines, empty
 * input, duplicate headers, and missing security headers all surface as
 * structured diagnostics.
 */
export function createHeadersTextParser(deps: HeadersTextParserDeps): Parser<HeadersArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text', 'http', 'headers'],
    produces: [HEADERS_KIND_DOCUMENT],
    parse(input: ParserInput): ParserResult<HeadersArtifact> {
      return parseHeaders(input, deps);
    },
  };
}

function parseHeaders(input: ParserInput, deps: HeadersTextParserDeps): ParserResult<HeadersArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  const sourceLines = input.raw.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  const lineStarts = computeLineStarts(input.raw);

  const entries: HeaderEntry[] = [];
  let startLine: string | null = null;
  const seen = new Map<string, number>();

  for (let i = 0; i < sourceLines.length; i += 1) {
    const rawLine = sourceLines[i]!;
    const lineNo = i + 1;
    if (rawLine.trim() === '') continue;

    const colon = rawLine.indexOf(':');
    if (colon === -1) {
      if (entries.length === 0 && startLine === null && START_LINE_REGEX.test(rawLine.trim())) {
        startLine = rawLine.trim();
        continue;
      }
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'error',
          HEADERS_DIAGNOSTIC_CODES.malformedLine,
          `line ${lineNo} is not a valid header (expected "Name: value")`,
          spanForLine(lineStarts[i] ?? 0, rawLine.length, lineNo),
        ),
      );
      continue;
    }

    const name = rawLine.slice(0, colon).trim();
    const value = rawLine.slice(colon + 1).trim();
    if (name === '') {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'error',
          HEADERS_DIAGNOSTIC_CODES.malformedLine,
          `line ${lineNo} has an empty header name`,
          spanForLine(lineStarts[i] ?? 0, rawLine.length, lineNo),
        ),
      );
      continue;
    }

    entries.push({ name, value, line: lineNo });
    const key = name.toLowerCase();
    const first = seen.get(key);
    if (first !== undefined) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          HEADERS_DIAGNOSTIC_CODES.duplicateHeader,
          `header "${name}" appears again at line ${lineNo} (first occurrence at line ${first})`,
        ),
      );
    } else {
      seen.set(key, lineNo);
    }
  }

  if (entries.length === 0) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        HEADERS_DIAGNOSTIC_CODES.emptyInput,
        input.raw.trim() === '' ? 'input is empty' : 'input contains no headers',
      ),
    );
  } else {
    for (const hint of SECURITY_HINTS) {
      if (!seen.has(hint.header)) {
        diagnostics.push(
          makeDiagnostic(diagIds(), 'info', HEADERS_DIAGNOSTIC_CODES.securityHint, hint.message),
        );
      }
    }
  }

  const threshold = deps.largeDocumentBytes ?? DEFAULT_LARGE_DOCUMENT_BYTES;
  const actualBytes = utf8ByteLength(input.raw);
  if (actualBytes > threshold) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        HEADERS_DIAGNOSTIC_CODES.largeDocument,
        `document is ${actualBytes} bytes; exceeds soft threshold of ${threshold} bytes`,
      ),
    );
  }

  const document: HeadersDocument = { entries, startLine };
  const artifact: HeadersDocumentArtifact = {
    version: 1,
    kind: HEADERS_KIND_DOCUMENT,
    id: artIds(),
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt: deps.clock.now(),
    source: input.source,
    value: document,
  };
  return { artifacts: [artifact], diagnostics };
}

function computeLineStarts(raw: string): readonly number[] {
  const starts: number[] = [0];
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function spanForLine(lineOffset: number, lineLen: number, lineNo: number): Diagnostic['span'] {
  return {
    startOffset: lineOffset,
    endOffset: lineOffset + lineLen,
    startLine: lineNo,
    startColumn: 1,
    endLine: lineNo,
    endColumn: lineLen + 1,
  };
}

const SHARED_UTF8_ENCODER = new TextEncoder();
function utf8ByteLength(s: string): number {
  return SHARED_UTF8_ENCODER.encode(s).byteLength;
}
