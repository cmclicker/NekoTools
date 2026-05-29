import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { MIME_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import { MIME_KIND_PARSED, type MimeArtifact, type MimeEntry, type MimeParsedArtifact, type MimeReport } from './kinds.js';
import { parseMime } from './mime.js';

const TOOL_ID = 'mime';
const PARSER_ID = 'mime.text';

export interface MimeTextParserDeps {
  readonly clock: Clock;
}

/**
 * The `mime.text` parser. Parses each line as a Content-Type / MIME type
 * (when it contains `/`) or a bare file extension, emitting essence,
 * suffix, registration tree, parameters, and known extensions. Never
 * throws; unrecognized input yields a `mime.parse_error`. No network.
 */
export function createMimeTextParser(deps: MimeTextParserDeps): Parser<MimeArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [MIME_KIND_PARSED],
    parse(input: ParserInput): ParserResult<MimeArtifact> {
      return parseMimes(input, deps.clock.now());
    },
  };
}

function parseMimes(input: ParserInput, producedAt: string): ParserResult<MimeArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  if (input.raw.trim() === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', MIME_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return { artifacts: [makeArtifact(artIds(), producedAt, input, { count: 0, entries: [] })], diagnostics };
  }

  const lines = input.raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  const entries: MimeEntry[] = [];

  for (const line of lines) {
    const value = parseMime(line);
    if (value === null) {
      entries.push({ input: line, valid: false, value: null });
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          MIME_DIAGNOSTIC_CODES.parseError,
          `"${truncate(line)}" is not a valid MIME type or known extension`,
        ),
      );
      continue;
    }
    entries.push({ input: line, valid: true, value });
    if (value.kind === 'content-type' && !value.known) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'info',
          MIME_DIAGNOSTIC_CODES.unknown,
          `"${value.essence}" parses but is not in the built-in type table`,
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
  value: MimeReport,
): MimeParsedArtifact {
  return {
    version: 1,
    kind: MIME_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
