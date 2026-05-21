import type {
  EnvDocument,
  EnvSchemaProperty,
  EnvSchemaValue,
  EnvValueShape,
} from './kinds.js';

/**
 * Basic per-document schema inference (free tier).
 *
 * Rules (deliberately minimal — advanced inference is Pro):
 *
 *   - `type` is always `'object'`. Dotenv documents are flat
 *     key→string maps; nesting is not part of the format.
 *   - `properties` contains one entry per **distinct** key in the
 *     document. Duplicates are collapsed; the **last** occurrence
 *     wins (matching dotenv loader semantics).
 *   - `required` contains every distinct key — every entry present
 *     in the source document is required to be present.
 *   - `additionalProperties` is `true` — a real production env may
 *     have keys the documentation didn't anticipate; basic inference
 *     does not invent a closed-world assumption.
 *
 * Per-property `shape` categorisation:
 *
 *   - empty   — the empty string
 *   - boolean — case-insensitive `true` / `false`
 *   - integer — `^-?\d+$`
 *   - decimal — `^-?\d+\.\d+$` or `^-?\d+(\.\d+)?[eE]-?\d+$`
 *   - url     — `^https?://...`
 *   - string  — anything else
 *
 * URL detection also emits `format: 'uri'` so the inferred schema is
 * usable as a (loose) JSON Schema for downstream tooling.
 */
export function inferBasicSchema(document: EnvDocument): EnvSchemaValue {
  const lastByKey = new Map<string, string>();
  for (const e of document.entries) {
    lastByKey.set(e.key, e.value);
  }
  const properties: Record<string, EnvSchemaProperty> = {};
  for (const [key, value] of lastByKey.entries()) {
    properties[key] = inferProperty(value);
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties,
    required: [...lastByKey.keys()],
    additionalProperties: true,
  };
}

export function inferProperty(value: string): EnvSchemaProperty {
  const shape = detectShape(value);
  if (shape === 'url') {
    return { type: 'string', shape, format: 'uri' };
  }
  return { type: 'string', shape };
}

export function detectShape(value: string): EnvValueShape {
  if (value === '') return 'empty';
  if (value === 'true' || value === 'false' || value === 'TRUE' || value === 'FALSE') {
    return 'boolean';
  }
  if (/^-?\d+$/.test(value)) return 'integer';
  if (/^-?\d+\.\d+$/.test(value)) return 'decimal';
  if (/^-?\d+(?:\.\d+)?[eE]-?\d+$/.test(value)) return 'decimal';
  if (/^https?:\/\/\S+$/i.test(value)) return 'url';
  return 'string';
}
