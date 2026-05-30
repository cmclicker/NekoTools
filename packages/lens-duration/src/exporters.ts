import type { Exporter } from '@nekotools/contracts';

import {
  DURATION_KIND_PARSED,
  DURATION_PARSED_EXPORT_KINDS,
  type DurationArtifact,
  type DurationParsedArtifact,
  type DurationReport,
} from './kinds.js';
import { toBreakdownCsv } from './codegen.js';

const TOOL_ID = 'duration';

function pickParsed(artifacts: readonly DurationArtifact[]): DurationParsedArtifact | undefined {
  return artifacts.find((a): a is DurationParsedArtifact => a.kind === DURATION_KIND_PARSED);
}

/** `duration.export.json` — the full per-entry breakdown. */
export const jsonExporter: Exporter<DurationArtifact> = {
  version: 1,
  id: 'duration.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: DURATION_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? { count: 0, entries: [] };
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(value, null, 2) };
  },
};

/** `duration.export.normalized` — the canonical ISO-8601 form, one per line. */
export const normalizedExporter: Exporter<DurationArtifact> = {
  version: 1,
  id: 'duration.export.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: DURATION_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const entries = pickParsed(artifacts)?.value.entries ?? [];
    const body = entries
      .map((e) => e.value?.iso)
      .filter((s): s is string => s !== undefined && s !== null)
      .join('\n');
    return { mimeType: 'text/plain', extension: 'txt', body };
  },
};

/** `duration.export.markdown.summary` — a per-entry table. */
export const markdownSummaryExporter: Exporter<DurationArtifact> = {
  version: 1,
  id: 'duration.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: DURATION_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value: DurationReport | undefined = pickParsed(artifacts)?.value;
    const entries = value?.entries ?? [];
    const lines: string[] = ['# NekoDuration export', '', `- entries: ${entries.length}`, ''];
    if (entries.length > 0) {
      lines.push('| input | total seconds | ISO-8601 | human | approx |');
      lines.push('| --- | ---: | --- | --- | --- |');
      for (const e of entries) {
        if (!e.valid || e.value === null) {
          lines.push(`| \`${e.input}\` | — | (invalid) | — | — |`);
          continue;
        }
        const v = e.value;
        lines.push(
          `| \`${e.input}\` | ${v.totalSeconds} | \`${v.iso}\` | ${v.human} | ${v.approximate ? 'yes' : 'no'} |`,
        );
      }
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<DurationArtifact>[] = [
  jsonExporter,
  normalizedExporter,
  markdownSummaryExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------
//
// Backs ONE of the two declared Pro exporter ids — `export.breakdown.csv` —
// a pure projection of the parsed d/h/m/s components. Generator in
// `codegen.ts`. The other declared id, `duration.export.locale`
// (`locale.format`), needs locale-specific human formatting that the
// manifest's out-of-scope list excludes (bundled i18n data); it stays
// advertising-only and is NOT registered, so it still throws "unknown
// exporter" — same partial-build pattern as NekoRegex.

/** `duration.export.breakdown.csv` (Pro) — per-input d/h/m/s CSV breakdown. */
export const breakdownCsvExporter: Exporter<DurationArtifact> = {
  version: 1,
  id: 'duration.export.breakdown.csv',
  toolId: TOOL_ID,
  target: 'csv',
  accepts: DURATION_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/csv',
  producesExtension: 'csv',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? { count: 0, entries: [] };
    return { mimeType: 'text/csv', extension: 'csv', body: toBreakdownCsv(value) };
  },
};

export const proExporters: readonly Exporter<DurationArtifact>[] = [breakdownCsvExporter];
