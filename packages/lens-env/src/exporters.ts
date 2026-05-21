import type { Exporter } from '@nekotools/contracts';

import { canonicalize, renderExample } from './canonical.js';
import {
  ENV_DIFF_EXPORT_KINDS,
  ENV_DOCUMENT_EXPORT_KINDS,
  ENV_KIND_DIFF,
  ENV_KIND_DOCUMENT,
  ENV_KIND_KEY_RESULT,
  ENV_KIND_SCHEMA,
  ENV_SUMMARY_EXPORT_KINDS,
  type EnvArtifact,
  type EnvDiffArtifact,
  type EnvDocumentArtifact,
  type EnvKeyResult,
  type EnvSchemaValue,
} from './kinds.js';
import { inferBasicSchema } from './schema-infer.js';

const TOOL_ID = 'env';

/**
 * Canonical re-emit of each input document. Preserves source order,
 * comments, and blank lines while normalizing quoting so escapes
 * round-trip safely.
 */
export const envCanonicalExporter: Exporter<EnvArtifact> = {
  version: 1,
  id: 'env.export.env.canonical',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: ENV_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'env',
  export({ artifacts }) {
    const docs = pickDocuments(artifacts);
    const bodies = docs.map((d) => canonicalize(d.value, 'preserved'));
    return { mimeType: 'text/plain', extension: 'env', body: bodies.join('\n\n') };
  },
};

/**
 * `.env.example` skeleton: keys + comments preserved, values stripped.
 */
export const envExampleExporter: Exporter<EnvArtifact> = {
  version: 1,
  id: 'env.export.env.example',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: ENV_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'env',
  export({ artifacts }) {
    const docs = pickDocuments(artifacts);
    const bodies = docs.map((d) => renderExample(d.value));
    return { mimeType: 'text/plain', extension: 'env', body: bodies.join('\n\n') };
  },
};

/**
 * Markdown summary. Top-level shape, key listings, schema, diff
 * summaries, and diagnostics — one section per artifact kind that's
 * present in the input.
 */
export const markdownSummaryExporter: Exporter<EnvArtifact> = {
  version: 1,
  id: 'env.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: ENV_SUMMARY_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const lines: string[] = ['# NekoEnv export', ''];

    const docs = pickDocuments(artifacts);
    if (docs.length > 0) {
      lines.push('## Documents', '');
      for (const doc of docs) {
        const v = doc.value;
        lines.push(
          `- **${doc.id}** — ${v.entries.length} entr${v.entries.length === 1 ? 'y' : 'ies'}, ${v.lines.length} line${v.lines.length === 1 ? '' : 's'}`,
        );
      }
      lines.push('');
    }

    const keyResults = artifacts.filter(
      (a) => a.kind === ENV_KIND_KEY_RESULT,
    ) as ReadonlyArray<EnvArtifact & { value: EnvKeyResult }>;
    if (keyResults.length > 0) {
      lines.push('## Key inspections', '');
      for (const k of keyResults) {
        const status = k.value.present ? 'present' : 'absent';
        lines.push(`- \`${k.value.key}\` — ${status}`);
      }
      lines.push('');
    }

    const schemas = artifacts.filter((a) => a.kind === ENV_KIND_SCHEMA);
    if (schemas.length > 0) {
      lines.push('## Inferred schemas', '');
      for (const s of schemas) lines.push(`- ${s.id}`);
      lines.push('');
    }

    const diffs = artifacts.filter(
      (a): a is EnvDiffArtifact => a.kind === ENV_KIND_DIFF,
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

/**
 * One key per line, sorted, deduplicated. Useful for grep/diff
 * workflows that want to compare key sets across environments.
 */
export const plaintextKeysExporter: Exporter<EnvArtifact> = {
  version: 1,
  id: 'env.export.plaintext.keys',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: ENV_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const docs = pickDocuments(artifacts);
    const keys = new Set<string>();
    for (const d of docs) {
      for (const e of d.value.entries) keys.add(e.key);
    }
    const sorted = [...keys].sort();
    return { mimeType: 'text/plain', extension: 'txt', body: sorted.join('\n') };
  },
};

/**
 * Inferred JSON Schema describing each document's keys + value shapes.
 * Multiple input documents produce a JSON array of schemas.
 */
export const basicSchemaExporter: Exporter<EnvArtifact> = {
  version: 1,
  id: 'env.export.schema.json-schema',
  toolId: TOOL_ID,
  target: 'json',
  accepts: ENV_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'application/schema+json',
  producesExtension: 'json',
  export({ artifacts }) {
    const docs = pickDocuments(artifacts);
    const schemas: EnvSchemaValue[] = docs.map((d) => inferBasicSchema(d.value));
    const body =
      schemas.length === 1
        ? JSON.stringify(schemas[0], null, 2)
        : JSON.stringify(schemas, null, 2);
    return { mimeType: 'application/schema+json', extension: 'json', body };
  },
};

/**
 * Renders an `env.diff` as unified-diff-style plaintext. Same shape
 * as NekoJSON's `json.export.diff.textual` — duplicated rather than
 * extracted (two examples is not enough yet).
 */
export const textualDiffExporter: Exporter<EnvArtifact> = {
  version: 1,
  id: 'env.export.diff.textual',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: ENV_DIFF_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'diff',
  export({ artifacts }) {
    const diffs = artifacts.filter(
      (a): a is EnvDiffArtifact => a.kind === ENV_KIND_DIFF,
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
    return { mimeType: 'text/plain', extension: 'diff', body: blocks.join('\n\n') };
  },
};

function pickDocuments(
  artifacts: readonly EnvArtifact[],
): readonly EnvDocumentArtifact[] {
  return artifacts.filter(
    (a): a is EnvDocumentArtifact => a.kind === ENV_KIND_DOCUMENT,
  );
}

export const freeExporters: readonly Exporter<EnvArtifact>[] = [
  envCanonicalExporter,
  envExampleExporter,
  markdownSummaryExporter,
  plaintextKeysExporter,
  basicSchemaExporter,
  textualDiffExporter,
];
