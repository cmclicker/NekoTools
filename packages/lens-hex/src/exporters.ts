import type { Exporter } from '@nekotools/contracts';

import { dumpText } from './hex.js';
import {
  HEX_KIND_PARSED,
  HEX_PARSED_EXPORT_KINDS,
  type HexArtifact,
  type HexParsedArtifact,
  type HexReport,
} from './kinds.js';

const TOOL_ID = 'hex';

function pickParsed(artifacts: readonly HexArtifact[]): HexParsedArtifact | undefined {
  return artifacts.find((a): a is HexParsedArtifact => a.kind === HEX_KIND_PARSED);
}

/** `hex.export.json` — mode, counts, continuous hex, ASCII, and dump rows. */
export const jsonExporter: Exporter<HexArtifact> = {
  version: 1,
  id: 'hex.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: HEX_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? null;
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(value, null, 2) };
  },
};

/** `hex.export.normalized` — the rendered hex dump as a text block. */
export const normalizedExporter: Exporter<HexArtifact> = {
  version: 1,
  id: 'hex.export.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: HEX_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const rows = pickParsed(artifacts)?.value.rows ?? [];
    return { mimeType: 'text/plain', extension: 'txt', body: dumpText(rows) };
  },
};

/** `hex.export.markdown.summary` — counts + the dump in a fenced block. */
export const markdownSummaryExporter: Exporter<HexArtifact> = {
  version: 1,
  id: 'hex.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: HEX_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value: HexReport | undefined = pickParsed(artifacts)?.value;
    const lines: string[] = ['# NekoHex export', ''];
    if (value !== undefined) {
      lines.push(`- mode: ${value.mode}`, `- bytes: ${value.byteLength}`, '');
      if (value.rows.length > 0) {
        lines.push('```', dumpText(value.rows), '```');
      }
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<HexArtifact>[] = [
  jsonExporter,
  normalizedExporter,
  markdownSummaryExporter,
];
