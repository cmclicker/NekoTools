import type { Exporter } from '@nekotools/contracts';

import {
  NDJSON_KIND_PARSED,
  NDJSON_PARSED_EXPORT_KINDS,
  type NdjsonArtifact,
  type NdjsonParsedArtifact,
  type NdjsonReport,
} from './kinds.js';

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
