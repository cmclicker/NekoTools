import type { Exporter } from '@nekotools/contracts';

import {
  JSON_DIFF_EXPORT_KINDS,
  JSON_DOCUMENT_EXPORT_KINDS,
  JSON_KIND_DIFF,
  JSON_KIND_DOCUMENT,
  JSON_KIND_PATH_RESULT,
  JSON_KIND_SCHEMA,
  JSON_SUMMARY_EXPORT_KINDS,
  type JsonArtifact,
  type JsonDiffArtifact,
  type JsonDocumentArtifact,
  type JsonPathResult,
  type JsonSchemaValue,
} from './kinds.js';
import { listPaths } from './paths.js';
import { inferBasicSchema } from './schema-infer.js';
import { toDataDictionary, toTypeScript, toZod } from './codegen.js';

const TOOL_ID = 'json';

/** Pretty-printed JSON of every document in the input. */
export const jsonPrettyExporter: Exporter<JsonArtifact> = {
  version: 1,
  id: 'json.export.json.pretty',
  toolId: TOOL_ID,
  target: 'json',
  accepts: JSON_DOCUMENT_EXPORT_KINDS,
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
  accepts: JSON_DOCUMENT_EXPORT_KINDS,
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

/**
 * Human-readable summary: top-level shape per document, path
 * inspections, inferred schemas, diff summaries, and diagnostics.
 * Accepts every shipped artifact kind and renders the appropriate
 * section for each.
 */
export const markdownSummaryExporter: Exporter<JsonArtifact> = {
  version: 1,
  id: 'json.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: JSON_SUMMARY_EXPORT_KINDS,
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

    const diffs = artifacts.filter(
      (a): a is JsonDiffArtifact => a.kind === JSON_KIND_DIFF,
    );
    if (diffs.length > 0) {
      lines.push('## Diffs', '');
      for (const d of diffs) {
        const adds = d.value.hunks.filter((h) => h.kind === 'add').length;
        const removes = d.value.hunks.filter((h) => h.kind === 'remove').length;
        lines.push(
          `- \`${d.value.leftArtifactId}\` → \`${d.value.rightArtifactId}\` — ${adds} added, ${removes} removed`,
        );
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
  accepts: JSON_DOCUMENT_EXPORT_KINDS,
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
  accepts: JSON_DOCUMENT_EXPORT_KINDS,
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

/**
 * Renders a `json.diff` artifact as unified-diff-style plaintext.
 *
 *   "  " before equal lines
 *   "+ " before added lines
 *   "- " before removed lines
 *
 * Multiple diff artifacts are concatenated with a single blank line
 * between them. Non-diff artifacts in the input are ignored.
 */
export const textualDiffExporter: Exporter<JsonArtifact> = {
  version: 1,
  id: 'json.export.diff.textual',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: JSON_DIFF_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'diff',
  export({ artifacts }) {
    const diffs = artifacts.filter(
      (a): a is JsonDiffArtifact => a.kind === JSON_KIND_DIFF,
    );
    const blocks: string[] = [];
    for (const d of diffs) {
      const { leftArtifactId, rightArtifactId, hunks } = d.value;
      const lines: string[] = [`--- ${leftArtifactId}`, `+++ ${rightArtifactId}`];
      for (const h of hunks) {
        switch (h.kind) {
          case 'equal':
            lines.push(`  ${h.text}`);
            break;
          case 'add':
            lines.push(`+ ${h.text}`);
            break;
          case 'remove':
            lines.push(`- ${h.text}`);
            break;
        }
      }
      blocks.push(lines.join('\n'));
    }
    return {
      mimeType: 'text/plain',
      extension: 'diff',
      body: blocks.join('\n\n'),
    };
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
  textualDiffExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------
//
// These back the manifest's declared Pro exporter ids. Each derives purely
// from the first `json.document` value (same basis as the free schema
// exporter) — no network, no premium-engine dependency. Code generation lives
// in `codegen.ts`.

/** `json.export.types.typescript` (Pro) — a TypeScript type from the document. */
export const typescriptExporter: Exporter<JsonArtifact> = {
  version: 1,
  id: 'json.export.types.typescript',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: JSON_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'ts',
  export({ artifacts }) {
    const doc = pickDocuments(artifacts)[0];
    const body = doc === undefined ? 'export type Root = unknown;\n' : toTypeScript(doc.value, 'Root');
    return { mimeType: 'text/plain', extension: 'ts', body };
  },
};

/** `json.export.types.zod` (Pro) — a Zod schema from the document. */
export const zodExporter: Exporter<JsonArtifact> = {
  version: 1,
  id: 'json.export.types.zod',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: JSON_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'ts',
  export({ artifacts }) {
    const doc = pickDocuments(artifacts)[0];
    const body =
      doc === undefined
        ? "import { z } from 'zod';\n\nexport const rootSchema = z.unknown();\n"
        : toZod(doc.value, 'rootSchema');
    return { mimeType: 'text/plain', extension: 'ts', body };
  },
};

/** `json.export.docs.data-dictionary` (Pro) — a markdown path/type/sample table. */
export const dataDictionaryExporter: Exporter<JsonArtifact> = {
  version: 1,
  id: 'json.export.docs.data-dictionary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: JSON_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const doc = pickDocuments(artifacts)[0];
    const body =
      doc === undefined
        ? '# NekoJSON data dictionary\n\n(no document)'
        : toDataDictionary(doc.value);
    return { mimeType: 'text/markdown', extension: 'md', body };
  },
};

export const proExporters: readonly Exporter<JsonArtifact>[] = [
  typescriptExporter,
  zodExporter,
  dataDictionaryExporter,
];
