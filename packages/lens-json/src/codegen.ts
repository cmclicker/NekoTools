import { listPaths } from './paths.js';

/**
 * NekoJSON Pro code generation. Backs the declared Pro exporters
 * `json.export.types.typescript`, `json.export.types.zod`, and
 * `json.export.docs.data-dictionary`. All three are pure, deterministic
 * functions of a parsed `json.document` value — no network, no clock.
 *
 * Type inference here mirrors the free `inferBasicSchema` shape rules
 * (object → fields, array → element type from the first element, number →
 * `number`), so the generated types line up with the schema the free tier
 * already shows. Deeper unification (oneOf, enum collapse) remains the
 * separate advanced-inference capability and is not attempted here.
 */

type JsonType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

function jsonType(value: unknown): JsonType {
  if (value === null) return 'null';
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
 * Generate a TypeScript type for `value`, rooted at interface `rootName`.
 * Nested objects become inline object types (kept simple + deterministic;
 * no name-hoisting, which would require collision handling). Arrays use the
 * first element as the element type; empty/unknown arrays become `unknown[]`.
 */
export function toTypeScript(value: unknown, rootName = 'Root'): string {
  return `export type ${rootName} = ${tsType(value, 0)};\n`;
}

function tsType(value: unknown, depth: number): string {
  const t = jsonType(value);
  switch (t) {
    case 'null':
      return 'null';
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array': {
      const arr = value as unknown[];
      if (arr.length === 0) return 'unknown[]';
      const elem = tsType(arr[0], depth);
      return /[ |&]/.test(elem) ? `Array<${elem}>` : `${elem}[]`;
    }
    case 'object': {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (keys.length === 0) return 'Record<string, never>';
      const pad = '  '.repeat(depth + 1);
      const closePad = '  '.repeat(depth);
      const fields = keys.map((k) => `${pad}${quoteKey(k)}: ${tsType(obj[k], depth + 1)};`);
      return `{\n${fields.join('\n')}\n${closePad}}`;
    }
  }
}

// --- Zod -------------------------------------------------------------------

/**
 * Generate a Zod schema for `value`, exported as `const <name>`. Mirrors the
 * TS shape rules; arrays use the first element, empty arrays become
 * `z.array(z.unknown())`.
 */
export function toZod(value: unknown, name = 'rootSchema'): string {
  return `import { z } from 'zod';\n\nexport const ${name} = ${zodType(value, 0)};\n`;
}

function zodType(value: unknown, depth: number): string {
  const t = jsonType(value);
  switch (t) {
    case 'null':
      return 'z.null()';
    case 'string':
      return 'z.string()';
    case 'number':
      return 'z.number()';
    case 'boolean':
      return 'z.boolean()';
    case 'array': {
      const arr = value as unknown[];
      if (arr.length === 0) return 'z.array(z.unknown())';
      return `z.array(${zodType(arr[0], depth)})`;
    }
    case 'object': {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (keys.length === 0) return 'z.object({})';
      const pad = '  '.repeat(depth + 1);
      const closePad = '  '.repeat(depth);
      const fields = keys.map((k) => `${pad}${quoteKey(k)}: ${zodType(obj[k], depth + 1)},`);
      return `z.object({\n${fields.join('\n')}\n${closePad}})`;
    }
  }
}

// --- Data dictionary -------------------------------------------------------

/** A short, single-line, secret-safe sample of a leaf value. */
function sampleOf(value: unknown): string {
  const t = jsonType(value);
  if (t === 'object') {
    return `{…} (${Object.keys(value as Record<string, unknown>).length} keys)`;
  }
  if (t === 'array') return `[…] (${(value as unknown[]).length} items)`;
  if (t === 'string') {
    const s = value as string;
    const trimmed = s.length > 40 ? `${s.slice(0, 40)}…` : s;
    return JSON.stringify(trimmed);
  }
  return JSON.stringify(value);
}

/**
 * A markdown data-dictionary: every JSON Pointer path, its type, and a short
 * sample value. The root row uses `(root)`. Long strings are truncated and
 * containers show a count instead of their contents.
 */
export function toDataDictionary(value: unknown): string {
  const lines: string[] = [
    '# NekoJSON data dictionary',
    '',
    '| path | type | sample |',
    '| --- | --- | --- |',
  ];
  for (const p of listPaths(value)) {
    const display = p.pointer === '' ? '(root)' : p.pointer;
    // Escape pipes so a value containing `|` can't break the table.
    const sample = sampleOf(p.value).replace(/\|/g, '\\|');
    lines.push(`| \`${display}\` | ${p.type} | ${sample} |`);
  }
  return lines.join('\n');
}
