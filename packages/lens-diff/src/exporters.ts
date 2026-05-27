import type { Exporter } from '@nekotools/contracts';

import {
  DIFF_KIND_RESULT,
  DIFF_RESULT_EXPORT_KINDS,
  type DiffArtifact,
  type DiffResultArtifact,
} from './kinds.js';

const TOOL_ID = 'diff';

function pickResults(artifacts: readonly DiffArtifact[]): readonly DiffResultArtifact[] {
  return artifacts.filter((a): a is DiffResultArtifact => a.kind === DIFF_KIND_RESULT);
}

/**
 * Unified-diff-style plaintext:
 *   "--- <leftLabel>" / "+++ <rightLabel>" header, then one line per hunk
 *   prefixed "  " (equal), "+ " (added), or "- " (removed).
 * Multiple diff artifacts are concatenated with a blank line between them.
 */
export const unifiedDiffExporter: Exporter<DiffArtifact> = {
  version: 1,
  id: 'diff.export.unified',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: DIFF_RESULT_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'diff',
  export({ artifacts }) {
    const blocks: string[] = [];
    for (const d of pickResults(artifacts)) {
      const { leftLabel, rightLabel, hunks } = d.value;
      const lines: string[] = [`--- ${leftLabel}`, `+++ ${rightLabel}`];
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

/** Machine-readable JSON summary: mode, labels, summary counts, and hunks. */
export const jsonSummaryExporter: Exporter<DiffArtifact> = {
  version: 1,
  id: 'diff.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: DIFF_RESULT_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const results = pickResults(artifacts).map((d) => d.value);
    const body = JSON.stringify(results.length === 1 ? results[0] : results, null, 2);
    return { mimeType: 'application/json', extension: 'json', body };
  },
};

/** Human-readable Markdown summary: per-diff counts + diagnostics. */
export const markdownSummaryExporter: Exporter<DiffArtifact> = {
  version: 1,
  id: 'diff.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: DIFF_RESULT_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const lines: string[] = ['# NekoDiff export', ''];
    for (const d of pickResults(artifacts)) {
      const s = d.value.summary;
      lines.push(`## ${d.value.leftLabel} → ${d.value.rightLabel} (${d.value.mode})`, '');
      if (!d.value.comparable) {
        lines.push('- not comparable (a side failed to parse — see diagnostics)');
      } else if (s.identical) {
        lines.push('- identical (no changes)');
      } else {
        lines.push(
          `- **${s.added}** added, **${s.removed}** removed, ${s.unchanged} unchanged (${s.changed} changed)`,
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

export const freeExporters: readonly Exporter<DiffArtifact>[] = [
  unifiedDiffExporter,
  jsonSummaryExporter,
  markdownSummaryExporter,
];
