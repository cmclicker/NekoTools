import type { Exporter } from '@nekotools/contracts';

import {
  UUID_KIND_PARSED,
  UUID_PARSED_EXPORT_KINDS,
  type UuidArtifact,
  type UuidParsedArtifact,
  type UuidReport,
} from './kinds.js';

const TOOL_ID = 'uuid';

function pickParsed(artifacts: readonly UuidArtifact[]): UuidParsedArtifact | undefined {
  return artifacts.find((a): a is UuidParsedArtifact => a.kind === UUID_KIND_PARSED);
}

/** `uuid.export.json` — the full per-id breakdown. */
export const jsonExporter: Exporter<UuidArtifact> = {
  version: 1,
  id: 'uuid.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: UUID_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? { count: 0, ids: [] };
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(value, null, 2) };
  },
};

/** `uuid.export.normalized` — canonical forms, one per line (invalid skipped). */
export const normalizedExporter: Exporter<UuidArtifact> = {
  version: 1,
  id: 'uuid.export.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: UUID_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const ids = pickParsed(artifacts)?.value.ids ?? [];
    const body = ids
      .map((i) => i.normalized)
      .filter((n): n is string => n !== null)
      .join('\n');
    return { mimeType: 'text/plain', extension: 'txt', body };
  },
};

/** `uuid.export.markdown.summary` — a per-id table. */
export const markdownSummaryExporter: Exporter<UuidArtifact> = {
  version: 1,
  id: 'uuid.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: UUID_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value: UuidReport | undefined = pickParsed(artifacts)?.value;
    const ids = value?.ids ?? [];
    const lines: string[] = ['# NekoUUID export', '', `- identifiers: ${ids.length}`, ''];

    if (ids.length > 0) {
      lines.push('| input | kind | version | variant | timestamp |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const i of ids) {
        const tag = i.isNil ? 'nil' : i.isMax ? 'max' : i.version !== null ? `v${i.version}` : '—';
        lines.push(
          `| \`${i.input}\` | ${i.kind} | ${tag} | ${i.variant ?? '—'} | ${i.timestamp ?? '—'} |`,
        );
      }
    }

    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<UuidArtifact>[] = [
  jsonExporter,
  normalizedExporter,
  markdownSummaryExporter,
];
