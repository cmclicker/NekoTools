/**
 * Walks a JSON value tree and yields every (pointer, value) pair.
 *
 * Used by the plaintext-paths exporter. Pointer encoding follows
 * RFC 6901 — `~` becomes `~0` and `/` becomes `~1`.
 */
export interface JsonPath {
  readonly pointer: string;
  readonly type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  readonly value: unknown;
}

export function listPaths(root: unknown): readonly JsonPath[] {
  const out: JsonPath[] = [];
  walk(root, '', out);
  return out;
}

function walk(value: unknown, pointer: string, out: JsonPath[]): void {
  const t = jsonType(value);
  out.push({ pointer: pointer === '' ? '' : pointer, type: t, value });
  if (t === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      walk(obj[key], `${pointer}/${encodePointerToken(key)}`, out);
    }
  } else if (t === 'array') {
    const arr = value as unknown[];
    for (let i = 0; i < arr.length; i += 1) {
      walk(arr[i], `${pointer}/${i}`, out);
    }
  }
}

function jsonType(value: unknown): JsonPath['type'] {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return t;
  return 'object';
}

function encodePointerToken(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}
