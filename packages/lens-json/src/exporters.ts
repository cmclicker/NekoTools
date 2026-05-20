import type { Exporter } from '@nekotools/contracts';

import {
  FREE_JSON_KINDS,
  JSON_KIND_DOCUMENT,
  JSON_KIND_PATH_RESULT,
  JSON_KIND_SCHEMA,
  type JsonArtifact,
  type JsonDocumentArtifact,
  type JsonPathResult,
  type JsonSchemaValue,
} from './kinds.js';
import { listPaths } from './paths.js';
import { inferBasicSchema } from './schema-infer.js';

const TOOL_ID = 'json';

/** Pretty-printed JSON of every document in the input. */
export const jsonPrettyExporter: Exporter<JsonArtifact> = {
  version: 1,
  id: 'json.export.json.pretty',
  toolId: TOOL_ID,
  target: 'json',
  accepts: FREE_JSON_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const docs = pickDocuments(artifacts);
    const body = docs.length === 1
      ? JSON.stringify(docs[0]!.value, null, 2)
      : JSON.stringify(docs.map((d) => d.value), null, 2);
    return { mimeType: 'application/json', extension: 'json', body };
  },
};

/** Minified JSON of every document in the input. */
export const jsonMinifiedExporter: Exporter<JsonArtifact> = {
  version: 1,
  id: 'json.export.json.minified',
  toolId: TOOL_ID,
  target: 'json',
  accepts: FREE_JSON_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const docs = pickDocuments(artifacts);
    const body = docs.length === 1
      ? JSON.stringify(docs[0]!.value)
      : JSON.stringify(docs.map((d) => d.value));
    return { mimeType: 'application/json', extension: 'json', body };
  },
};

/** Human-readable summary: top-level keys, diagnostics, path counts. */
export const markdownSummaryExporter: Exporter<JsonArtifact> = {
  version: 1,
  id: 'json.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: FREE_JSON_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const lines: string[] = ['# NekoJSON export', ''];

    const docs = pickDocuments(artifacts);
    if (docs.length > 0) {
      lines.push('## Documents', '');
      for (const doc of docs) {
        const v = doc.value;
        const summary = topLevelSummary(v);
        lines.push(`- **${doc.id}** — ${summary}`);
      }
      lines.push('');
    }

    const pathResults = artifacts.filter(
      (a) => a.kind === JSON_KIND_PATH_RESULT,
    ) as ReadonlyArray<JsonArtifact & { value: JsonPathResult }>;
    if (pathResults.length > 0) {
      lines.push('## Path inspections', '');
      for (const p of pathResults) {
        const status = p.value.resolved ? 'resolved' : 'unresolved';
        lines.push(`- \`${p.value.pointer || '(root)'}\` — ${status}`);
      }
      lines.push('');
    }

    const schemas = artifacts.filter((a) => a.kind === JSON_KIND_SCHEMA);
    if (schemas.length > 0) {
      lines.push('## Inferred schemas', '');
      for (const s of schemas) {
        lines.push(`- ${s.id}`);
      }
      lines.push('');
    }

    if (diagnostics.length > 0) {
      lines.push('## Diagnostics', '');
      for (const d of diagnostics) {
        lines.push(`- **${d.severity.toUpperCase()}** \`${d.code}\` — ${d.message}`);
      }
      lines.push('');
    }

    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

/** TSV-ish: every JSON Pointer path + its leaf type. */
export const plaintextPathsExporter: Exporter<JsonArtifact> = {
  version: 1,
  id: 'json.export.plaintext.paths',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: [JSON_KIND_DOCUMENT],
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const lines: string[] = [];
    for (const doc of pickDocuments(artifacts)) {
      for (const p of listPaths(doc.value)) {
        const display = p.pointer === '' ? '(root)' : p.pointer;
        lines.push(`${display}\t${p.type}`);
      }
    }
    return { mimeType: 'text/plain', extension: 'txt', body: lines.join('\n') };
  },
};

/** Basic JSON Schema inferred from every json.document artifact in the input. */
export const basicSchemaExporter: Exporter<JsonArtifact> = {
  version: 1,
  id: 'json.export.schema.json-schema',
  toolId: TOOL_ID,
  target: 'json',
  accepts: [JSON_KIND_DOCUMENT],
  producesMimeType: 'application/schema+json',
  producesExtension: 'json',
  export({ artifacts }) {
    const docs = pickDocuments(artifacts);
    const schemas: JsonSchemaValue[] = docs.map((d) => inferBasicSchema(d.value));
    const body =
      schemas.length === 1
        ? JSON.stringify(schemas[0], null, 2)
        : JSON.stringify(schemas, null, 2);
    return { mimeType: 'application/schema+json', extension: 'json', body };
  },
};

function pickDocuments(artifacts: readonly JsonArtifact[]): readonly JsonDocumentArtifact[] {
  return artifacts.filter(
    (a): a is JsonDocumentArtifact => a.kind === JSON_KIND_DOCUMENT,
  );
}

function topLevelSummary(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array (${value.length} item${value.length === 1 ? '' : 's'})`;
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return `object (${keys.length} key${keys.length === 1 ? '' : 's'})`;
  }
  return typeof value;
}

export const freeExporters: readonly Exporter<JsonArtifact>[] = [
  jsonPrettyExporter,
  jsonMinifiedExporter,
  markdownSummaryExporter,
  plaintextPathsExporter,
  basicSchemaExporter,
];
