import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { HEX_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import { bytesToHex, decodeHex, dumpRows, textToBytes } from './hex.js';
import { HEX_KIND_PARSED, type HexArtifact, type HexMode, type HexParsedArtifact, type HexReport } from './kinds.js';

const TOOL_ID = 'hex';
const PARSER_ID = 'hex.text';

export interface HexTextParserDeps {
  readonly clock: Clock;
}

function resolveMode(hints: ParserInput['hints']): HexMode {
  return hints?.mode === 'hex' ? 'hex' : 'text';
}

function asciiOf(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.';
  return s;
}

/**
 * The `hex.text` parser. Renders the input as a hex dump — treating it as
 * UTF-8 text (default) or decoding a hex string (`hints.mode = 'hex'`).
 * Never throws; a malformed hex string yields an error diagnostic.
 */
export function createHexTextParser(deps: HexTextParserDeps): Parser<HexArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [HEX_KIND_PARSED],
    parse(input: ParserInput): ParserResult<HexArtifact> {
      return parseHex(input, deps.clock.now());
    },
  };
}

function parseHex(input: ParserInput, producedAt: string): ParserResult<HexArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];
  const mode = resolveMode(input.hints);

  if (input.raw === '') {
    diagnostics.push(makeDiagnostic(diagIds(), 'info', HEX_DIAGNOSTIC_CODES.emptyInput, 'input is empty'));
    return { artifacts: [makeArtifact(artIds(), producedAt, input, empty(mode))], diagnostics };
  }

  let bytes: Uint8Array;
  let valid = true;
  if (mode === 'hex') {
    const decoded = decodeHex(input.raw);
    if (!decoded.ok) {
      valid = false;
      diagnostics.push(
        decoded.error === 'odd'
          ? makeDiagnostic(diagIds(), 'error', HEX_DIAGNOSTIC_CODES.oddLength, 'hex input has an odd number of digits')
          : makeDiagnostic(diagIds(), 'error', HEX_DIAGNOSTIC_CODES.invalid, 'hex input contains a non-hex character'),
      );
      const invalid: HexReport = { mode, valid: false, byteLength: 0, hex: '', ascii: '', rows: [] };
      return { artifacts: [makeArtifact(artIds(), producedAt, input, invalid)], diagnostics };
    }
    bytes = decoded.bytes;
  } else {
    bytes = textToBytes(input.raw);
  }

  const report: HexReport = {
    mode,
    valid,
    byteLength: bytes.length,
    hex: bytesToHex(bytes),
    ascii: asciiOf(bytes),
    rows: dumpRows(bytes),
  };
  return { artifacts: [makeArtifact(artIds(), producedAt, input, report)], diagnostics };
}

function empty(mode: HexMode): HexReport {
  return { mode, valid: true, byteLength: 0, hex: '', ascii: '', rows: [] };
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: HexReport,
): HexParsedArtifact {
  return {
    version: 1,
    kind: HEX_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
