import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';

import {
  BINARY_KIND_BYTES,
  BINARY_KIND_NUMBER,
  BINARY_KIND_TEXT,
  type BinaryArtifact,
} from './kinds.js';
import { bytesToHex, makeIdFactory, type Clock } from './util.js';

const TOOL_ID = 'binary';

function diag(
  ids: () => string,
  severity: Diagnostic['severity'],
  code: string,
  message: string,
  span?: Diagnostic['span'],
  hint?: string,
): Diagnostic {
  const d: { -readonly [K in keyof Diagnostic]: Diagnostic[K] } = {
    version: 1,
    id: ids(),
    severity,
    code,
    message,
  };
  if (span !== undefined) d.span = span;
  if (hint !== undefined) d.hint = hint;
  return d;
}

interface ParserDeps {
  readonly clock: Clock;
}

export function createDecimalParser(deps: ParserDeps): Parser<BinaryArtifact> {
  return {
    version: 1,
    id: 'binary.decimal',
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['decimal'],
    produces: [BINARY_KIND_NUMBER],
    parse(input: ParserInput): ParserResult<BinaryArtifact> {
      const ids = makeIdFactory('art');
      const diagIds = makeIdFactory('diag');
      const raw = input.raw.trim();

      if (raw === '') {
        return {
          artifacts: [],
          diagnostics: [
            diag(diagIds, 'error', 'binary.empty_input', 'input is empty'),
          ],
        };
      }

      if (!/^[0-9]+$/.test(raw)) {
        return {
          artifacts: [],
          diagnostics: [
            diag(
              diagIds,
              'error',
              'binary.invalid_decimal',
              `"${raw}" is not a non-negative decimal integer`,
            ),
          ],
        };
      }

      const value = Number(raw);
      const diagnostics: Diagnostic[] = [];
      if (!Number.isSafeInteger(value)) {
        diagnostics.push(
          diag(
            diagIds,
            'warning',
            'binary.unsafe_integer',
            `${raw} exceeds Number.MAX_SAFE_INTEGER; precision will be lost`,
          ),
        );
      }

      return {
        artifacts: [
          {
            version: 1,
            kind: BINARY_KIND_NUMBER,
            id: ids(),
            producedBy: { toolId: TOOL_ID, parserId: 'binary.decimal', parserVersion: 1 },
            producedAt: deps.clock.now(),
            source: input.source,
            value,
          },
        ],
        diagnostics,
      };
    },
  };
}

export function createBinaryParser(deps: ParserDeps): Parser<BinaryArtifact> {
  return {
    version: 1,
    id: 'binary.binary',
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['binary'],
    produces: [BINARY_KIND_NUMBER],
    parse(input: ParserInput): ParserResult<BinaryArtifact> {
      const ids = makeIdFactory('art');
      const diagIds = makeIdFactory('diag');
      const raw = input.raw.trim().replace(/^0b/i, '');

      if (raw === '') {
        return {
          artifacts: [],
          diagnostics: [diag(diagIds, 'error', 'binary.empty_input', 'input is empty')],
        };
      }

      const invalid: Diagnostic[] = [];
      for (let i = 0; i < raw.length; i += 1) {
        const ch = raw.charAt(i);
        if (ch !== '0' && ch !== '1') {
          invalid.push(
            diag(
              diagIds,
              'error',
              'binary.invalid_digit',
              `invalid binary digit "${ch}"`,
              { startOffset: i, endOffset: i + 1 },
            ),
          );
        }
      }
      if (invalid.length > 0) {
        return { artifacts: [], diagnostics: invalid };
      }

      const value = parseInt(raw, 2);
      return {
        artifacts: [
          {
            version: 1,
            kind: BINARY_KIND_NUMBER,
            id: ids(),
            producedBy: { toolId: TOOL_ID, parserId: 'binary.binary', parserVersion: 1 },
            producedAt: deps.clock.now(),
            source: input.source,
            value,
          },
        ],
        diagnostics: [],
      };
    },
  };
}

export function createHexParser(deps: ParserDeps): Parser<BinaryArtifact> {
  return {
    version: 1,
    id: 'binary.hex',
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['hex'],
    produces: [BINARY_KIND_BYTES],
    parse(input: ParserInput): ParserResult<BinaryArtifact> {
      const ids = makeIdFactory('art');
      const diagIds = makeIdFactory('diag');
      const raw = input.raw.trim().replace(/^0x/i, '').replace(/\s+/g, '');

      if (raw === '') {
        return {
          artifacts: [],
          diagnostics: [diag(diagIds, 'error', 'binary.empty_input', 'input is empty')],
        };
      }

      if (raw.length % 2 !== 0) {
        return {
          artifacts: [],
          diagnostics: [
            diag(
              diagIds,
              'error',
              'binary.hex_odd_length',
              `hex string has odd length ${raw.length}; expected even`,
              undefined,
              'pad with a leading "0" if you meant a half-byte',
            ),
          ],
        };
      }

      const bad: Diagnostic[] = [];
      for (let i = 0; i < raw.length; i += 1) {
        const ch = raw.charAt(i);
        if (!/[0-9a-fA-F]/.test(ch)) {
          bad.push(
            diag(
              diagIds,
              'error',
              'binary.invalid_hex_digit',
              `invalid hex digit "${ch}"`,
              { startOffset: i, endOffset: i + 1 },
            ),
          );
        }
      }
      if (bad.length > 0) return { artifacts: [], diagnostics: bad };

      const bytes = new Uint8Array(raw.length / 2);
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
      }

      return {
        artifacts: [
          {
            version: 1,
            kind: BINARY_KIND_BYTES,
            id: ids(),
            producedBy: { toolId: TOOL_ID, parserId: 'binary.hex', parserVersion: 1 },
            producedAt: deps.clock.now(),
            source: input.source,
            value: bytesToHex(bytes),
          },
        ],
        diagnostics: [],
      };
    },
  };
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export function createBase64Parser(deps: ParserDeps): Parser<BinaryArtifact> {
  return {
    version: 1,
    id: 'binary.base64',
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['base64'],
    produces: [BINARY_KIND_BYTES],
    parse(input: ParserInput): ParserResult<BinaryArtifact> {
      const ids = makeIdFactory('art');
      const diagIds = makeIdFactory('diag');
      const raw = input.raw.trim();

      if (raw === '') {
        return {
          artifacts: [],
          diagnostics: [diag(diagIds, 'error', 'binary.empty_input', 'input is empty')],
        };
      }

      if (!BASE64_PATTERN.test(raw)) {
        return {
          artifacts: [],
          diagnostics: [
            diag(
              diagIds,
              'error',
              'binary.invalid_base64',
              'input contains characters outside the standard base64 alphabet',
            ),
          ],
        };
      }

      const diagnostics: Diagnostic[] = [];
      if (raw.length % 4 !== 0) {
        diagnostics.push(
          diag(
            diagIds,
            'warning',
            'binary.base64_unsafe_padding',
            'length is not a multiple of 4; padding may be missing',
          ),
        );
      }

      let bytes: Uint8Array;
      try {
        const padded = raw.padEnd(Math.ceil(raw.length / 4) * 4, '=');
        const bin = atob(padded);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      } catch (err) {
        return {
          artifacts: [],
          diagnostics: [
            diag(
              diagIds,
              'error',
              'binary.base64_decode_failed',
              err instanceof Error ? err.message : String(err),
            ),
          ],
        };
      }

      return {
        artifacts: [
          {
            version: 1,
            kind: BINARY_KIND_BYTES,
            id: ids(),
            producedBy: { toolId: TOOL_ID, parserId: 'binary.base64', parserVersion: 1 },
            producedAt: deps.clock.now(),
            source: input.source,
            value: bytesToHex(bytes),
          },
        ],
        diagnostics,
      };
    },
  };
}

export function createUtf8Parser(deps: ParserDeps): Parser<BinaryArtifact> {
  return {
    version: 1,
    id: 'binary.utf8',
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['utf8', 'text'],
    produces: [BINARY_KIND_TEXT],
    parse(input: ParserInput): ParserResult<BinaryArtifact> {
      const ids = makeIdFactory('art');
      const diagIds = makeIdFactory('diag');
      const diagnostics: Diagnostic[] = [];

      for (let i = 0; i < input.raw.length; i += 1) {
        const code = input.raw.charCodeAt(i);
        if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
          diagnostics.push(
            diag(
              diagIds,
              'warning',
              'binary.non_printable',
              `non-printable character U+${code.toString(16).padStart(4, '0')} at offset ${i}`,
              { startOffset: i, endOffset: i + 1 },
            ),
          );
        }
      }

      return {
        artifacts: [
          {
            version: 1,
            kind: BINARY_KIND_TEXT,
            id: ids(),
            producedBy: { toolId: TOOL_ID, parserId: 'binary.utf8', parserVersion: 1 },
            producedAt: deps.clock.now(),
            source: input.source,
            value: input.raw,
          },
        ],
        diagnostics,
      };
    },
  };
}

export function createAllParsers(deps: ParserDeps): readonly Parser<BinaryArtifact>[] {
  return [
    createDecimalParser(deps),
    createBinaryParser(deps),
    createHexParser(deps),
    createBase64Parser(deps),
    createUtf8Parser(deps),
  ];
}
