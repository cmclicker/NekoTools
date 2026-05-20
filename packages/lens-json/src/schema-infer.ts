import type { JsonSchemaType, JsonSchemaValue } from './kinds.js';

/**
 * Basic JSON Schema inference (free tier).
 *
 * Rules (deliberately minimal):
 *   - object → `type: object`, infer each property's schema, mark
 *     present keys as required, allow `additionalProperties`.
 *   - array  → `type: array`, infer item schema from the first element
 *     only. If the array is empty, `items` is omitted.
 *   - number → `integer` if integer-valued, otherwise `number`.
 *   - null   → `type: null`.
 *
 * Advanced inference (oneOf, enum collapse, format detection, sample
 * unification across array elements) is Pro and not in this PR.
 */
export function inferBasicSchema(value: unknown): JsonSchemaValue {
  const inferred = inferInner(value);
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ...inferred,
  };
}

function inferInner(value: unknown): JsonSchemaValue {
  const t = primitiveType(value);
  if (t === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    const properties: Record<string, JsonSchemaValue> = {};
    for (const k of keys) {
      properties[k] = inferInner(obj[k]);
    }
    const schema: JsonSchemaValue = {
      type: 'object',
      properties,
      required: keys,
      additionalProperties: true,
    };
    return schema;
  }
  if (t === 'array') {
    const arr = value as unknown[];
    if (arr.length === 0) {
      return { type: 'array' };
    }
    return { type: 'array', items: inferInner(arr[0]) };
  }
  return { type: t };
}

function primitiveType(value: unknown): JsonSchemaType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
    case 'number':
      return Number.isInteger(value) ? 'integer' : 'number';
    case 'object':
      return 'object';
    default:
      return 'string';
  }
}
