import type { Exporter } from '@nekotools/contracts';

import {
  SORT_KIND_PARSED,
  SORT_PARSED_EXPORT_KINDS,
  type SortArtifact,
  type SortParsedArtifact,
  type SortReport,
} from './kinds.js';
import { toFrequencyCsv, toInputOutputDiff } from './codegen.js';

const TOOL_ID = 'sort';

function pickParsed(artifacts: readonly SortArtifact[]): SortParsedArtifact | undefined {
  return artifacts.find((a): a is SortParsedArtifact => a.kind === SORT_KIND_PARSED);
}

/** `sort.export.json` — the result lines + options + counts. */
export const jsonExporter: Exporter<SortArtifact> = {
  version: 1,
  id: 'sort.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: SORT_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? null;
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(value, null, 2) };
  },
};

/** `sort.export.normalized` — the transformed text (result lines joined). */
export const normalizedExporter: Exporter<SortArtifact> = {
  version: 1,
  id: 'sort.export.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: SORT_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const lines = pickParsed(artifacts)?.value.lines ?? [];
    return { mimeType: 'text/plain', extension: 'txt', body: lines.join('\n') };
  },
};

/** `sort.export.markdown.summary` — counts + options used. */
export const markdownSummaryExporter: Exporter<SortArtifact> = {
  version: 1,
  id: 'sort.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: SORT_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value: SortReport | undefined = pickParsed(artifacts)?.value;
    const lines: string[] = ['# NekoSort export', ''];
    if (value === undefined) {
      lines.push('No result.');
      return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
    }
    const o = value.options;
    lines.push(
      `- input lines: ${value.inputCount}`,
      `- output lines: ${value.outputCount}`,
      `- removed: ${value.removed}`,
      `- options: order=${o.order}, unique=${o.unique}, caseInsensitive=${o.caseInsensitive}, numeric=${o.numeric}, trim=${o.trimLines}, removeBlank=${o.removeBlank}`,
    );
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<SortArtifact>[] = [
  jsonExporter,
  normalizedExporter,
  markdownSummaryExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------
//
// Backs BOTH declared Pro exporter ids — `export.frequency` (count over the
// result lines) and `export.diff` (input→output diff). Generators in
// `codegen.ts`. The diff reads the artifact's retained `inputLines` (added
// alongside this exporter) so the input→output diff is a pure function of the
// artifact.

/** `sort.export.frequency` (Pro) — count per result line, most frequent first. */
export const frequencyExporter: Exporter<SortArtifact> = {
  version: 1,
  id: 'sort.export.frequency',
  toolId: TOOL_ID,
  target: 'csv',
  accepts: SORT_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/csv',
  producesExtension: 'csv',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value;
    const body = value === undefined ? 'count,line' : toFrequencyCsv(value);
    return { mimeType: 'text/csv', extension: 'csv', body };
  },
};

/** `sort.export.diff` (Pro) — a unified-diff of the input→output transform. */
export const diffExporter: Exporter<SortArtifact> = {
  version: 1,
  id: 'sort.export.diff',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: SORT_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'diff',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value;
    const body = value === undefined ? '--- input (0 lines)\n+++ output (0 lines)' : toInputOutputDiff(value);
    return { mimeType: 'text/plain', extension: 'diff', body };
  },
};

export const proExporters: readonly Exporter<SortArtifact>[] = [frequencyExporter, diffExporter];
