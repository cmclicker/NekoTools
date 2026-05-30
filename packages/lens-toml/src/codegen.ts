import type { TomlValue } from './kinds.js';

/**
 * NekoTOML Pro code generation. Backs the declared Pro exporters
 * `toml.export.types` (pro entitlement `infer.types`) and
 * `toml.export.schema.json` (pro entitlement `infer.schema`).
 *
 * Both are pure, deterministic functions of a decoded `toml.parsed` value
 * tree — no network, no clock, no premium-engine dependency. The shape
 * rules mirror NekoJSON's (`toTypeScript` / `inferBasicSchema`): object →
 * fields, array → element type from the first element, integer-valued
 * number → `integer`. Deeper unification (oneOf, enum collapse, array
 * element merging) is the separate advanced-inference capability and is not
 * attempted here. A `null` tree (empty / failed parse) yields a stable
 * `unknown`-shaped result rather than throwing.
 */

type TomlJsonType = 'object' | 'array' | 'string' | 'number' | 'boolean';

function tomlType(value: TomlValue): TomlJsonType {
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return t;
  return 'object';
}

/** A valid TS/JS identifier? Bare keys can be emitted unquoted. */
function isSafeIdentifier(key: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

function quoteKey(key: string): string {
  return isSafeIdentifier(key) ? key : JSON.stringify(key);
}

// --- TypeScript ------------------------------------------------------------

/**
 * Generate a TypeScript type for a decoded TOML tree, rooted at type
 * `rootName`. Nested tables become inline object types (kept simple +
 * deterministic; no name-hoisting, which would require collision handling).
 * Arrays use the first element as the element type; empty arrays become
 * `unknown[]`. A `null` tree becomes `unknown`.
 */
export function toTypeScript(value: TomlValue | null, rootName = 'Config'): string {
  if (value === null) return `export type ${rootName} = unknown;\n`;
  return `export type ${rootName} = ${tsType(value, 0)};\n`;
}

function tsType(value: TomlValue, depth: number): string {
  switch (tomlType(value)) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array': {
      const arr = value as readonly TomlValue[];
      if (arr.length === 0) return 'unknown[]';
      const elem = tsType(arr[0]!, depth);
      return /[ |&]/.test(elem) ? `Array<${elem}>` : `${elem}[]`;
    }
    case 'object': {
      const obj = value as { readonly [key: string]: TomlValue };
      const keys = Object.keys(obj);
      if (keys.length === 0) return 'Record<string, never>';
      const pad = '  '.repeat(depth + 1);
      const closePad = '  '.repeat(depth);
      const fields = keys.map((k) => `${pad}${quoteKey(k)}: ${tsType(obj[k]!, depth + 1)};`);
      return `{\n${fields.join('\n')}\n${closePad}}`;
    }
  }
}

// --- JSON Schema -----------------------------------------------------------

/** A minimal JSON-Schema node (local to lens-toml — no cross-tool dep). */
export interface JsonSchemaNode {
  readonly $schema?: string;
  readonly type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';
  readonly properties?: Readonly<Record<string, JsonSchemaNode>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly items?: JsonSchemaNode;
}

/**
 * Infer a basic JSON Schema from a decoded TOML tree. Mirrors NekoJSON's
 * `inferBasicSchema`: objects infer each property + mark present keys
 * required (open-world `additionalProperties: true`), arrays infer item
 * shape from the first element only, integer-valued numbers become
 * `integer`. A `null` tree yields just the `$schema` marker.
 */
export function inferJsonSchema(value: TomlValue | null): JsonSchemaNode {
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', ...inferInner(value) };
}

function inferInner(value: TomlValue | null): JsonSchemaNode {
  if (value === null) return {};
  if (Array.isArray(value)) {
    const arr = value as readonly TomlValue[];
    if (arr.length === 0) return { type: 'array' };
    return { type: 'array', items: inferInner(arr[0]!) };
  }
  const t = typeof value;
  if (t === 'object') {
    const obj = value as { readonly [key: string]: TomlValue };
    const keys = Object.keys(obj);
    const properties: Record<string, JsonSchemaNode> = {};
    for (const k of keys) properties[k] = inferInner(obj[k]!);
    return { type: 'object', properties, required: keys, additionalProperties: true };
  }
  if (t === 'number') return { type: Number.isInteger(value as number) ? 'integer' : 'number' };
  if (t === 'boolean') return { type: 'boolean' };
  return { type: 'string' };
}
