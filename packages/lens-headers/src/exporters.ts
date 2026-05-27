import type { Exporter } from '@nekotools/contracts';

import {
  HEADERS_DOCUMENT_EXPORT_KINDS,
  HEADERS_KIND_DOCUMENT,
  type HeadersArtifact,
  type HeadersDocumentArtifact,
} from './kinds.js';

const TOOL_ID = 'headers';

function pickDocuments(artifacts: readonly HeadersArtifact[]): readonly HeadersDocumentArtifact[] {
  return artifacts.filter((a): a is HeadersDocumentArtifact => a.kind === HEADERS_KIND_DOCUMENT);
}

/**
 * Headers as a JSON object (name -> value). Repeated names collapse to an
 * array of values so the export is lossless. Names keep their original
 * case from the first occurrence.
 */
export const jsonExporter: Exporter<HeadersArtifact> = {
  version: 1,
  id: 'headers.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: HEADERS_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const out: Record<string, string | string[]> = {};
    for (const doc of pickDocuments(artifacts)) {
      for (const entry of doc.value.entries) {
        const existing = out[entry.name];
        if (existing === undefined) {
          out[entry.name] = entry.value;
        } else if (Array.isArray(existing)) {
          existing.push(entry.value);
        } else {
          out[entry.name] = [existing, entry.value];
        }
      }
    }
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(out, null, 2) };
  },
};

/** Markdown summary: header count, the headers, and any diagnostics. */
export const markdownSummaryExporter: Exporter<HeadersArtifact> = {
  version: 1,
  id: 'headers.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: HEADERS_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const docs = pickDocuments(artifacts);
    const lines: string[] = ['# NekoHeaders export', ''];
    for (const doc of docs) {
      if (doc.value.startLine !== null) lines.push(`- start line: \`${doc.value.startLine}\``);
      lines.push(`- ${doc.value.entries.length} header${doc.value.entries.length === 1 ? '' : 's'}`);
      for (const entry of doc.value.entries) {
        lines.push(`  - \`${entry.name}\`: ${entry.value}`);
      }
    }
    lines.push('');
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

export const freeExporters: readonly Exporter<HeadersArtifact>[] = [
  jsonExporter,
  markdownSummaryExporter,
];
