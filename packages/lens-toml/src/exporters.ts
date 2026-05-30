import type { Exporter } from '@nekotools/contracts';

import {
  TOML_KIND_PARSED,
  TOML_PARSED_EXPORT_KINDS,
  type ParsedToml,
  type TomlArtifact,
  type TomlParsedArtifact,
  type TomlValue,
} from './kinds.js';
import { inferJsonSchema, toTypeScript } from './codegen.js';

const TOOL_ID = 'toml';

function pickParsed(artifacts: readonly TomlArtifact[]): TomlParsedArtifact | undefined {
  return artifacts.find((a): a is TomlParsedArtifact => a.kind === TOML_KIND_PARSED);
}

function isPlainObject(v: TomlValue): v is { readonly [key: string]: TomlValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isArrayOfTables(v: TomlValue): v is readonly { readonly [key: string]: TomlValue }[] {
  return Array.isArray(v) && v.length > 0 && v.every(isPlainObject);
}

const BARE_KEY_RE = /^[A-Za-z0-9_-]+$/;

function formatKey(key: string): string {
  return BARE_KEY_RE.test(key) ? key : formatString(key);
}

function formatString(s: string): string {
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r');
  return `"${escaped}"`;
}

/** Render a scalar / value-array / inline-table for the right-hand side. */
function formatInline(value: TomlValue): string {
  if (typeof value === 'string') return formatString(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => formatInline(v)).join(', ')}]`;
  }
  // Inline table (a nested object inside a value position).
  const pairs = Object.entries(value).map(([k, v]) => `${formatKey(k)} = ${formatInline(v)}`);
  return `{ ${pairs.join(', ')} }`;
}

/**
 * Serialize a decoded table tree back to canonical, deterministic TOML:
 * simple key/value pairs first (in insertion order), then `[sub.table]`
 * blocks, then `[[array.of.tables]]` blocks. Used by the normalized
 * exporter so two semantically equal documents produce identical text.
 */
function serializeToml(data: TomlValue): string {
  if (!isPlainObject(data)) return '';
  const lines: string[] = [];
  emitTable(data, [], lines);
  return lines.join('\n');
}

function emitTable(
  node: { readonly [key: string]: TomlValue },
  path: readonly string[],
  lines: string[],
): void {
  const simple: [string, TomlValue][] = [];
  const subTables: [string, { readonly [key: string]: TomlValue }][] = [];
  const tableArrays: [string, readonly { readonly [key: string]: TomlValue }[]][] = [];

  for (const [key, value] of Object.entries(node)) {
    if (isArrayOfTables(value)) tableArrays.push([key, value]);
    else if (isPlainObject(value)) subTables.push([key, value]);
    else simple.push([key, value]);
  }

  for (const [key, value] of simple) lines.push(`${formatKey(key)} = ${formatInline(value)}`);

  for (const [key, value] of subTables) {
    const childPath = [...path, key];
    if (lines.length > 0) lines.push('');
    lines.push(`[${childPath.map(formatKey).join('.')}]`);
    emitTable(value, childPath, lines);
  }

  for (const [key, entries] of tableArrays) {
    const childPath = [...path, key];
    const header = `[[${childPath.map(formatKey).join('.')}]]`;
    for (const entry of entries) {
      if (lines.length > 0) lines.push('');
      lines.push(header);
      emitTable(entry, childPath, lines);
    }
  }
}

/**
 * `toml.export.json` — the decoded value tree as pretty JSON. Date-times
 * appear as the strings NekoTOML preserved them as (it never reinterprets
 * them into a host `Date`).
 */
export const jsonExporter: Exporter<TomlArtifact> = {
  version: 1,
  id: 'toml.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: TOML_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const data = pickParsed(artifacts)?.value.data ?? null;
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(data, null, 2) };
  },
};

/**
 * `toml.export.normalized` — the document re-serialized to canonical TOML
 * (simple keys, then `[tables]`, then `[[array-tables]]`). Empty string
 * when the input did not parse into a table.
 */
export const normalizedExporter: Exporter<TomlArtifact> = {
  version: 1,
  id: 'toml.export.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: TOML_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'toml',
  export({ artifacts }) {
    const data = pickParsed(artifacts)?.value.data ?? null;
    const body = data === null ? '' : serializeToml(data);
    return { mimeType: 'text/plain', extension: 'toml', body };
  },
};

/**
 * `toml.export.markdown.summary` — a human-readable breakdown of the
 * document shape (table / key counts, top-level keys + value types) and
 * diagnostics.
 */
export const markdownSummaryExporter: Exporter<TomlArtifact> = {
  version: 1,
  id: 'toml.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: TOML_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const parsed = pickParsed(artifacts);
    const value: ParsedToml | undefined = parsed?.value;
    const lines: string[] = ['# NekoTOML export', '', '## Document', ''];

    if (value === undefined || value.data === null) {
      lines.push('- valid: no');
    } else {
      lines.push(
        `- valid: ${value.valid ? 'yes' : 'no'}`,
        `- tables: ${value.tableCount}`,
        `- keys: ${value.keyCount}`,
      );
      if (isPlainObject(value.data)) {
        const keys = Object.keys(value.data);
        if (keys.length > 0) {
          lines.push('', '## Top-level keys', '');
          for (const key of keys) {
            lines.push(`- \`${key}\` — ${describeType(value.data[key] as TomlValue)}`);
          }
        }
      }
    }

    if (diagnostics.length > 0) {
      lines.push('', '## Diagnostics', '');
      for (const d of diagnostics) {
        lines.push(`- **${d.severity.toUpperCase()}** \`${d.code}\` — ${d.message}`);
      }
    }

    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

function describeType(value: TomlValue): string {
  if (isArrayOfTables(value)) return `array of ${value.length} table(s)`;
  if (Array.isArray(value)) return `array (${value.length})`;
  if (isPlainObject(value)) return 'table';
  return typeof value;
}

export const freeExporters: readonly Exporter<TomlArtifact>[] = [
  jsonExporter,
  normalizedExporter,
  markdownSummaryExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------
//
// These back the manifest's declared Pro exporter ids (`infer.types` /
// `infer.schema`). Each derives purely from the decoded `toml.parsed` value
// tree — no network, no premium-engine dependency. Code generation lives in
// `codegen.ts` and mirrors NekoJSON's shape rules.

/** `toml.export.types` (Pro) — a TypeScript type from the decoded tree. */
export const typescriptExporter: Exporter<TomlArtifact> = {
  version: 1,
  id: 'toml.export.types',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: TOML_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'ts',
  export({ artifacts }) {
    const data = pickParsed(artifacts)?.value.data ?? null;
    return { mimeType: 'text/plain', extension: 'ts', body: toTypeScript(data, 'Config') };
  },
};

/** `toml.export.schema.json` (Pro) — an inferred JSON Schema from the tree. */
export const schemaJsonExporter: Exporter<TomlArtifact> = {
  version: 1,
  id: 'toml.export.schema.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: TOML_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/schema+json',
  producesExtension: 'json',
  export({ artifacts }) {
    const data = pickParsed(artifacts)?.value.data ?? null;
    const body = JSON.stringify(inferJsonSchema(data), null, 2);
    return { mimeType: 'application/schema+json', extension: 'json', body };
  },
};

export const proExporters: readonly Exporter<TomlArtifact>[] = [
  typescriptExporter,
  schemaJsonExporter,
];
