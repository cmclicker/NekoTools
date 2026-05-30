import type { NdjsonReport } from './kinds.js';

/**
 * NekoNDJSON Pro code generation. Backs the declared Pro exporters
 * `ndjson.export.schema.json` (pro entitlement `infer.schema`) and
 * `ndjson.export.csv` (pro entitlement `flatten.csv`).
 *
 * Both are pure, deterministic functions of an already-parsed
 * `ndjson.parsed` report — no network, no clock, no premium engine. The
 * schema reuses the parser's pre-computed `fields` (key / types / optional);
 * the CSV flattens valid object records into a grid. Per the manifest's
 * out-of-scope notes, inference is "basic type union only" (no formats /
 * enums) and the CSV is a flat grid (nested object/array cells are emitted
 * as compact JSON, not exploded into dotted-path columns).
 */

/** A minimal JSON-Schema node (local to lens-ndjson — no cross-tool dep). */
export interface JsonSchemaNode {
  readonly $schema?: string;
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchemaNode>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

const SCHEMA_URI = 'https://json-schema.org/draft/2020-12/schema';

/** A single type, or a basic type union, as a JSON-Schema `type` node. */
function typeNode(types: readonly string[]): JsonSchemaNode {
  if (types.length === 0) return {};
  if (types.length === 1) return { type: types[0]! };
  return { type: [...types] };
}

/**
 * Infer a JSON Schema describing **one record** of the stream. When every
 * valid record is an object, emits an object schema from the pre-computed
 * field shape (present-in-all keys are `required`, open-world
 * `additionalProperties: true`, per-key type unions). For a mixed stream,
 * emits the basic type union of the record value types. With no valid
 * records, emits an unconstrained schema (just the `$schema` marker).
 */
export function inferRecordSchema(report: NdjsonReport): JsonSchemaNode {
  if (report.validCount === 0) return { $schema: SCHEMA_URI };

  if (report.homogeneousObjects) {
    const properties: Record<string, JsonSchemaNode> = {};
    const required: string[] = [];
    for (const f of report.fields) {
      properties[f.key] = typeNode(f.types);
      if (!f.optional) required.push(f.key);
    }
    return {
      $schema: SCHEMA_URI,
      type: 'object',
      properties,
      required,
      additionalProperties: true,
    };
  }

  const recordTypes = [
    ...new Set(
      report.records.filter((r) => r.valid && r.type !== null).map((r) => r.type as string),
    ),
  ].sort();
  return { $schema: SCHEMA_URI, ...typeNode(recordTypes) };
}

// --- CSV flatten -----------------------------------------------------------

/** Valid records that are JSON objects (the only rows a grid can hold). */
function objectRecords(report: NdjsonReport): Record<string, unknown>[] {
  return report.records
    .filter((r) => r.valid && r.type === 'object' && r.value !== null)
    .map((r) => r.value as Record<string, unknown>);
}

/** Union of keys across the object records, in first-appearance order. */
function columnsOf(objects: readonly Record<string, unknown>[]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const obj of objects) {
    for (const k of Object.keys(obj)) {
      if (!seen.has(k)) {
        seen.add(k);
        order.push(k);
      }
    }
  }
  return order;
}

/** Render a single cell value: scalars as-is, null/absent empty, nested → JSON. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** RFC 4180 quoting: wrap + double the quotes only when the field needs it. */
function csvField(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Flatten the valid object records into a CSV grid: a header row of the key
 * union (first-appearance order), then one row per object record. Non-object
 * records (scalars, arrays) cannot be columnar and are omitted. Returns the
 * empty string when there are no object records.
 */
export function toCsv(report: NdjsonReport): string {
  const objects = objectRecords(report);
  if (objects.length === 0) return '';
  const cols = columnsOf(objects);
  const lines: string[] = [cols.map(csvField).join(',')];
  for (const obj of objects) {
    lines.push(cols.map((c) => csvField(csvCell(obj[c]))).join(','));
  }
  return lines.join('\n');
}
