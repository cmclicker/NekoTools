import type { Exporter } from '@nekotools/contracts';

import {
  HASH_DIGEST_EXPORT_KINDS,
  HASH_KIND_DIGEST,
  type HashArtifact,
  type HashDigestArtifact,
} from './kinds.js';

const TOOL_ID = 'hash';

function pickDigests(artifacts: readonly HashArtifact[]): readonly HashDigestArtifact[] {
  return artifacts.filter((a): a is HashDigestArtifact => a.kind === HASH_KIND_DIGEST);
}

/** The raw hex digest(s), one per line — the classic checksum line. */
export const digestExporter: Exporter<HashArtifact> = {
  version: 1,
  id: 'hash.export.digest',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: HASH_DIGEST_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const body = pickDigests(artifacts)
      .map((d) => d.value.hex)
      .join('\n');
    return { mimeType: 'text/plain', extension: 'txt', body };
  },
};

/** A structured JSON summary: algorithm, hex, base64, input byte length. */
export const jsonSummaryExporter: Exporter<HashArtifact> = {
  version: 1,
  id: 'hash.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: HASH_DIGEST_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const summaries = pickDigests(artifacts).map((d) => ({
      tool: 'NekoHash',
      algorithm: d.value.algorithm,
      hex: d.value.hex,
      base64: d.value.base64,
      inputBytes: d.value.inputBytes,
    }));
    const payload = summaries.length === 1 ? summaries[0] : summaries;
    return {
      mimeType: 'application/json',
      extension: 'json',
      body: JSON.stringify(payload, null, 2),
    };
  },
};

/** A human-readable Markdown summary, including any diagnostics. */
export const markdownSummaryExporter: Exporter<HashArtifact> = {
  version: 1,
  id: 'hash.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: HASH_DIGEST_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const lines: string[] = ['# NekoHash digest', ''];
    for (const d of pickDigests(artifacts)) {
      lines.push(
        `- **algorithm**: ${d.value.algorithm}`,
        `- **input bytes**: ${d.value.inputBytes}`,
        `- **hex**: \`${d.value.hex}\``,
        `- **base64**: \`${d.value.base64}\``,
        '',
      );
    }
    if (diagnostics.length > 0) {
      lines.push('## Diagnostics', '');
      for (const dg of diagnostics) {
        lines.push(`- **${dg.severity.toUpperCase()}** \`${dg.code}\` — ${dg.message}`);
      }
      lines.push('');
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<HashArtifact>[] = [
  digestExporter,
  jsonSummaryExporter,
  markdownSummaryExporter,
];
