import type { Exporter } from '@nekotools/contracts';

import {
  SORT_KIND_PARSED,
  SORT_PARSED_EXPORT_KINDS,
  type SortArtifact,
  type SortParsedArtifact,
  type SortReport,
} from './kinds.js';
import { toFrequencyCsv } from './codegen.js';

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
// Backs ONE of the two declared Pro exporter ids — `export.frequency` — a
// pure count over the result lines. Generator in `codegen.ts`. The other
// declared id, `sort.export.diff` (`export.diff`), would diff the original
// input vs the output, but the sort.parsed artifact retains only the output
// lines (not the pre-transform input), so it stays advertising-only and is
// NOT registered — still throws "unknown exporter".

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

export const proExporters: readonly Exporter<SortArtifact>[] = [frequencyExporter];
