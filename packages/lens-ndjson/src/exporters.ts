import type { Exporter } from '@nekotools/contracts';

import {
  NDJSON_KIND_PARSED,
  NDJSON_PARSED_EXPORT_KINDS,
  type NdjsonArtifact,
  type NdjsonParsedArtifact,
  type NdjsonReport,
} from './kinds.js';
import { inferRecordSchema, toCsv } from './codegen.js';

const TOOL_ID = 'ndjson';

function pickParsed(artifacts: readonly NdjsonArtifact[]): NdjsonParsedArtifact | undefined {
  return artifacts.find((a): a is NdjsonParsedArtifact => a.kind === NDJSON_KIND_PARSED);
}

/** `ndjson.export.json` — the valid records as a single pretty JSON array. */
export const jsonArrayExporter: Exporter<NdjsonArtifact> = {
  version: 1,
  id: 'ndjson.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: NDJSON_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const records = pickParsed(artifacts)?.value.records ?? [];
    const values = records.filter((r) => r.valid).map((r) => r.value);
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(values, null, 2) };
  },
};

/** `ndjson.export.ndjson` — valid records re-serialized compact, one per line. */
export const ndjsonExporter: Exporter<NdjsonArtifact> = {
  version: 1,
  id: 'ndjson.export.ndjson',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: NDJSON_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/x-ndjson',
  producesExtension: 'ndjson',
  export({ artifacts }) {
    const records = pickParsed(artifacts)?.value.records ?? [];
    const body = records
      .filter((r) => r.valid)
      .map((r) => JSON.stringify(r.value))
      .join('\n');
    return { mimeType: 'application/x-ndjson', extension: 'ndjson', body };
  },
};

/** `ndjson.export.markdown.summary` — counts + inferred shape. */
export const markdownSummaryExporter: Exporter<NdjsonArtifact> = {
  version: 1,
  id: 'ndjson.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: NDJSON_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value: NdjsonReport | undefined = pickParsed(artifacts)?.value;
    const lines: string[] = ['# NekoNDJSON export', ''];
    if (value === undefined) {
      lines.push('No records.');
      return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
    }
    lines.push(
      `- records: ${value.count}`,
      `- valid: ${value.validCount} · invalid: ${value.invalidCount}`,
    );
    if (value.fields.length > 0) {
      lines.push('', '## Inferred shape', '', '| key | types | optional |', '| --- | --- | --- |');
      for (const f of value.fields) {
        lines.push(`| \`${f.key}\` | ${f.types.join(', ')} | ${f.optional ? 'yes' : 'no'} |`);
      }
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<NdjsonArtifact>[] = [
  jsonArrayExporter,
  ndjsonExporter,
  markdownSummaryExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------
//
// These back the manifest's declared Pro exporter ids (`infer.schema` /
// `flatten.csv`). Both derive purely from the already-parsed `ndjson.parsed`
// report — no network, no premium-engine dependency. Code generation lives in
// `codegen.ts`.

/** `ndjson.export.schema.json` (Pro) — inferred JSON Schema for one record. */
export const schemaJsonExporter: Exporter<NdjsonArtifact> = {
  version: 1,
  id: 'ndjson.export.schema.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: NDJSON_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/schema+json',
  producesExtension: 'json',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value;
    const schema = value === undefined ? { $schema: 'https://json-schema.org/draft/2020-12/schema' } : inferRecordSchema(value);
    return { mimeType: 'application/schema+json', extension: 'json', body: JSON.stringify(schema, null, 2) };
  },
};

/** `ndjson.export.csv` (Pro) — valid object records flattened to a CSV grid. */
export const csvExporter: Exporter<NdjsonArtifact> = {
  version: 1,
  id: 'ndjson.export.csv',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: NDJSON_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/csv',
  producesExtension: 'csv',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value;
    const body = value === undefined ? '' : toCsv(value);
    return { mimeType: 'text/csv', extension: 'csv', body };
  },
};

export const proExporters: readonly Exporter<NdjsonArtifact>[] = [
  schemaJsonExporter,
  csvExporter,
];
