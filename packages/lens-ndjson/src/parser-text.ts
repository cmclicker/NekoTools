import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { NDJSON_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  NDJSON_KIND_PARSED,
  type NdjsonArtifact,
  type NdjsonField,
  type NdjsonParsedArtifact,
  type NdjsonRecord,
  type NdjsonReport,
} from './kinds.js';

const TOOL_ID = 'ndjson';
const PARSER_ID = 'ndjson.text';

export interface NdjsonTextParserDeps {
  readonly clock: Clock;
}

/** JSON value type tag. */
export function jsonType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/**
 * The `ndjson.text` parser. Decodes newline-delimited JSON one record per
 * line; a malformed line yields a `ndjson.parse_error` (with its line
 * number) and an invalid record, while every other line still parses.
 * Blank lines are skipped. Infers a field shape when all valid records are
 * objects. Never throws; no network.
 */
export function createNdjsonTextParser(deps: NdjsonTextParserDeps): Parser<NdjsonArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [NDJSON_KIND_PARSED],
    parse(input: ParserInput): ParserResult<NdjsonArtifact> {
      return parseNdjson(input, deps.clock.now());
    },
  };
}

function parseNdjson(input: ParserInput, producedAt: string): ParserResult<NdjsonArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  if (input.raw.trim() === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', NDJSON_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return { artifacts: [makeArtifact(artIds(), producedAt, input, emptyReport())], diagnostics };
  }

  const lines = input.raw.split(/\r?\n/);
  const records: NdjsonRecord[] = [];
  let validCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]!.trim();
    if (text === '') continue; // blank lines are not records
    const lineNo = i + 1;
    try {
      const value = JSON.parse(text) as unknown;
      validCount += 1;
      records.push({ line: lineNo, valid: true, value, type: jsonType(value), error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      records.push({ line: lineNo, valid: false, value: null, type: null, error: message });
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          NDJSON_DIAGNOSTIC_CODES.parseError,
          `line ${lineNo}: ${message}`,
        ),
      );
    }
  }

  const validValues = records.filter((r) => r.valid).map((r) => r.value);
  const homogeneousObjects =
    validValues.length > 0 && validValues.every((v) => jsonType(v) === 'object');
  const fields = homogeneousObjects ? inferFields(validValues as Record<string, unknown>[]) : [];

  if (validValues.length > 0 && !homogeneousObjects) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        NDJSON_DIAGNOSTIC_CODES.mixedShape,
        'records are not all JSON objects; shape inference skipped',
      ),
    );
  }

  const report: NdjsonReport = {
    count: records.length,
    validCount,
    invalidCount: records.length - validCount,
    records,
    fields,
    homogeneousObjects,
  };
  return { artifacts: [makeArtifact(artIds(), producedAt, input, report)], diagnostics };
}

function inferFields(objects: readonly Record<string, unknown>[]): NdjsonField[] {
  const types = new Map<string, Set<string>>();
  const present = new Map<string, number>();
  // First-appearance key order for determinism.
  const order: string[] = [];

  for (const obj of objects) {
    for (const key of Object.keys(obj)) {
      if (!types.has(key)) {
        types.set(key, new Set());
        present.set(key, 0);
        order.push(key);
      }
      types.get(key)!.add(jsonType(obj[key]));
      present.set(key, (present.get(key) ?? 0) + 1);
    }
  }

  return order.map((key) => ({
    key,
    types: [...types.get(key)!].sort(),
    present: present.get(key) ?? 0,
    optional: (present.get(key) ?? 0) < objects.length,
  }));
}

function emptyReport(): NdjsonReport {
  return {
    count: 0,
    validCount: 0,
    invalidCount: 0,
    records: [],
    fields: [],
    homogeneousObjects: false,
  };
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: NdjsonReport,
): NdjsonParsedArtifact {
  return {
    version: 1,
    kind: NDJSON_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
