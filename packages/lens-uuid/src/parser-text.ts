import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { UUID_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  UUID_KIND_PARSED,
  type ParsedId,
  type UuidArtifact,
  type UuidParsedArtifact,
  type UuidReport,
} from './kinds.js';

const TOOL_ID = 'uuid';
const PARSER_ID = 'uuid.text';

export interface UuidTextParserDeps {
  readonly clock: Clock;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CROCKFORD_INDEX = new Map<string, number>([...CROCKFORD].map((c, i) => [c, i]));
// 100-ns intervals between the Gregorian epoch (1582-10-15) and the Unix epoch.
const GREGORIAN_OFFSET_100NS = 122192928000000000n;

/**
 * The `uuid.text` parser. Decodes each input line as a UUID (v1–v8, nil,
 * max) or a ULID, extracting version, variant, and any embedded timestamp.
 * Never throws; a non-matching line yields a `uuid.parse_error` and an
 * `invalid` entry. Pure bit-math — no randomness, clock, or network.
 */
export function createUuidTextParser(deps: UuidTextParserDeps): Parser<UuidArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [UUID_KIND_PARSED],
    parse(input: ParserInput): ParserResult<UuidArtifact> {
      return parseUuids(input, deps.clock.now());
    },
  };
}

function parseUuids(input: ParserInput, producedAt: string): ParserResult<UuidArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  if (input.raw.trim() === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', UUID_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return {
      artifacts: [makeArtifact(artIds(), producedAt, input, { count: 0, ids: [] })],
      diagnostics,
    };
  }

  const lines = input.raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  const ids: ParsedId[] = [];

  for (const line of lines) {
    const parsed = parseOne(line);
    ids.push(parsed);
    if (!parsed.valid) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          UUID_DIAGNOSTIC_CODES.parseError,
          `"${truncate(line)}" is not a valid UUID or ULID`,
        ),
      );
    }
  }

  return {
    artifacts: [makeArtifact(artIds(), producedAt, input, { count: ids.length, ids })],
    diagnostics,
  };
}

function parseOne(line: string): ParsedId {
  const cleaned = line
    .replace(/^urn:uuid:/i, '')
    .replace(/^\{(.*)\}$/, '$1')
    .trim();

  if (UUID_RE.test(cleaned)) return parseUuid(line, cleaned);
  if (isUlid(cleaned)) return parseUlid(line, cleaned);
  return {
    input: line,
    kind: 'invalid',
    valid: false,
    version: null,
    variant: null,
    normalized: null,
    timestamp: null,
    isNil: false,
    isMax: false,
  };
}

function parseUuid(input: string, canonical: string): ParsedId {
  const hex = canonical.replace(/-/g, '').toLowerCase();
  const isNil = /^0{32}$/.test(hex);
  const isMax = /^f{32}$/.test(hex);
  const versionNibble = parseInt(hex[12]!, 16);
  const version = isNil || isMax ? null : versionNibble;
  const variant = isNil || isMax ? null : variantOf(hex[16]!);
  const timestamp = version === null ? null : timestampForVersion(version, hex);

  return {
    input,
    kind: 'uuid',
    valid: true,
    version,
    variant,
    normalized: canonical.toLowerCase(),
    timestamp,
    isNil,
    isMax,
  };
}

function variantOf(varChar: string): string {
  const v = parseInt(varChar, 16);
  if (v < 0x8) return 'NCS (reserved)';
  if (v < 0xc) return 'RFC 4122';
  if (v < 0xe) return 'Microsoft (reserved)';
  return 'reserved (future)';
}

function timestampForVersion(version: number, hex: string): string | null {
  if (version === 1) return isoOf(gregorianToUnixMs((bi(hex, 12, 16) & 0x0fffn) << 48n | (bi(hex, 8, 12) << 32n) | bi(hex, 0, 8)));
  if (version === 6) {
    const ts = (bi(hex, 0, 8) << 28n) | (bi(hex, 8, 12) << 12n) | (bi(hex, 12, 16) & 0x0fffn);
    return isoOf(gregorianToUnixMs(ts));
  }
  if (version === 7) return isoOf(Number(bi(hex, 0, 12)));
  return null;
}

function bi(hex: string, start: number, end: number): bigint {
  return BigInt(`0x${hex.slice(start, end)}`);
}

function gregorianToUnixMs(ts100ns: bigint): number {
  return Number((ts100ns - GREGORIAN_OFFSET_100NS) / 10000n);
}

function isUlid(s: string): boolean {
  if (s.length !== 26) return false;
  const upper = s.toUpperCase();
  for (const ch of upper) if (!CROCKFORD_INDEX.has(ch)) return false;
  return true;
}

function parseUlid(input: string, canonical: string): ParsedId {
  const upper = canonical.toUpperCase();
  let ms = 0;
  for (const ch of upper.slice(0, 10)) ms = ms * 32 + (CROCKFORD_INDEX.get(ch) ?? 0);
  return {
    input,
    kind: 'ulid',
    valid: true,
    version: null,
    variant: null,
    normalized: upper,
    timestamp: isoOf(ms),
    isNil: false,
    isMax: false,
  };
}

function isoOf(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toISOString();
  } catch {
    return null;
  }
}

function truncate(s: string): string {
  return s.length > 50 ? `${s.slice(0, 50)}…` : s;
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: UuidReport,
): UuidParsedArtifact {
  return {
    version: 1,
    kind: UUID_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
