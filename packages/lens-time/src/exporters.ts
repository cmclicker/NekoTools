import type { Exporter } from '@nekotools/contracts';

import {
  TIME_INSTANT_EXPORT_KINDS,
  TIME_KIND_INSTANT,
  type TimeArtifact,
  type TimeInstant,
  type TimeInstantArtifact,
} from './kinds.js';

const TOOL_ID = 'time';

function pickInstant(artifacts: readonly TimeArtifact[]): TimeInstant | null {
  const found = artifacts.find((a): a is TimeInstantArtifact => a.kind === TIME_KIND_INSTANT);
  return found?.value ?? null;
}

/** JSON summary of the resolved instant (every free-tier field). */
export const jsonExporter: Exporter<TimeArtifact> = {
  version: 1,
  id: 'time.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: TIME_INSTANT_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const body = JSON.stringify(pickInstant(artifacts), null, 2);
    return { mimeType: 'application/json', extension: 'json', body };
  },
};

/** The single ISO-8601 UTC string — the most common copy target. */
export const isoExporter: Exporter<TimeArtifact> = {
  version: 1,
  id: 'time.export.iso',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: TIME_INSTANT_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const instant = pickInstant(artifacts);
    return { mimeType: 'text/plain', extension: 'txt', body: instant?.iso ?? '' };
  },
};

/** Human-readable markdown summary, including any diagnostics. */
export const markdownSummaryExporter: Exporter<TimeArtifact> = {
  version: 1,
  id: 'time.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: TIME_INSTANT_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const instant = pickInstant(artifacts);
    const lines: string[] = ['# NekoTime', ''];
    if (instant === null) {
      lines.push('_No instant resolved._', '');
    } else {
      lines.push(
        `- **Interpretation**: ${instant.interpretation}`,
        `- **ISO (UTC)**: ${instant.iso}`,
        `- **Unix seconds**: ${instant.epochSeconds}`,
        `- **Unix milliseconds**: ${instant.epochMillis}`,
        `- **Local**: ${instant.local.formatted} (UTC${instant.local.offsetLabel}, ${instant.local.timeZone})`,
        `- **Relative**: ${instant.relative.label}`,
        '',
      );
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

export const freeExporters: readonly Exporter<TimeArtifact>[] = [
  jsonExporter,
  isoExporter,
  markdownSummaryExporter,
];
