import type { Exporter } from '@nekotools/contracts';

import {
  LOG_ENTRY_EXPORT_KINDS,
  LOG_KIND_DOCUMENT,
  LOG_KIND_FILTER_RESULT,
  LOG_KIND_SUMMARY,
  LOG_LEVELS,
  LOG_SUMMARY_EXPORT_KINDS,
  type LogArtifact,
  type LogEntry,
  type LogSummary,
} from './kinds.js';

const TOOL_ID = 'logs';

/**
 * Pull the entry list from either a `log.document` or a
 * `log.filter-result` artifact. Both carry entries; the entry-row
 * exporters accept both kinds.
 */
function pickEntries(artifacts: readonly LogArtifact[]): readonly LogEntry[] {
  const out: LogEntry[] = [];
  for (const a of artifacts) {
    if (a.kind === LOG_KIND_DOCUMENT) {
      out.push(...a.value.entries);
    } else if (a.kind === LOG_KIND_FILTER_RESULT) {
      out.push(...a.value.entries);
    }
  }
  return out;
}

/** Re-emit (filtered) entries as their raw log lines. */
export const textPlainExporter: Exporter<LogArtifact> = {
  version: 1,
  id: 'log.export.text.plain',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: LOG_ENTRY_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'log',
  export({ artifacts }) {
    const body = pickEntries(artifacts)
      .map((e) => e.raw)
      .join('\n');
    return { mimeType: 'text/plain', extension: 'log', body };
  },
};

/** Messages only, one per line. */
export const plaintextMessagesExporter: Exporter<LogArtifact> = {
  version: 1,
  id: 'log.export.plaintext.messages',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: LOG_ENTRY_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const body = pickEntries(artifacts)
      .map((e) => e.message)
      .join('\n');
    return { mimeType: 'text/plain', extension: 'txt', body };
  },
};

/** Entries as a structured JSON array. */
export const jsonEntriesExporter: Exporter<LogArtifact> = {
  version: 1,
  id: 'log.export.json.entries',
  toolId: TOOL_ID,
  target: 'json',
  accepts: LOG_ENTRY_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const body = JSON.stringify(pickEntries(artifacts), null, 2);
    return { mimeType: 'application/json', extension: 'json', body };
  },
};

/** Entries as CSV: line, timestamp, level, message, fields (JSON). */
export const csvEntriesExporter: Exporter<LogArtifact> = {
  version: 1,
  id: 'log.export.csv.entries',
  toolId: TOOL_ID,
  target: 'csv',
  accepts: LOG_ENTRY_EXPORT_KINDS,
  producesMimeType: 'text/csv',
  producesExtension: 'csv',
  export({ artifacts }) {
    const rows: string[] = ['line,timestamp,level,message,fields'];
    for (const e of pickEntries(artifacts)) {
      rows.push(
        [
          String(e.lineNumber),
          csvCell(e.timestamp ?? ''),
          csvCell(e.level ?? ''),
          csvCell(e.message),
          csvCell(JSON.stringify(e.fields)),
        ].join(','),
      );
    }
    return { mimeType: 'text/csv', extension: 'csv', body: rows.join('\n') };
  },
};

/** Render a `log.summary` as a Markdown report. */
export const markdownSummaryExporter: Exporter<LogArtifact> = {
  version: 1,
  id: 'log.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: LOG_SUMMARY_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const summaries = artifacts.filter(
      (a): a is LogArtifact & { value: LogSummary } => a.kind === LOG_KIND_SUMMARY,
    );
    const lines: string[] = ['# NekoLogs summary', ''];
    for (const s of summaries) {
      const v = s.value;
      lines.push(`- **${s.id}** — ${v.total} entr${v.total === 1 ? 'y' : 'ies'}`, '');
      lines.push('## Counts by level', '');
      for (const level of LOG_LEVELS) {
        const n = v.byLevel[level] ?? 0;
        if (n > 0) lines.push(`- ${level}: ${n}`);
      }
      const none = v.byLevel['none'] ?? 0;
      if (none > 0) lines.push(`- (no level): ${none}`);
      lines.push('');
      if (v.timeRange.startMs !== null && v.timeRange.endMs !== null) {
        lines.push('## Time range', '');
        lines.push(`- start: ${new Date(v.timeRange.startMs).toISOString()}`);
        lines.push(`- end: ${new Date(v.timeRange.endMs).toISOString()}`);
        lines.push('');
      }
      if (v.unparseableCount > 0) {
        lines.push(`Unparseable lines: ${v.unparseableCount}`, '');
      }
      if (v.topMessages.length > 0) {
        lines.push('## Top messages', '');
        for (const m of v.topMessages) lines.push(`- ${m.count}× \`${m.message}\``);
        lines.push('');
      }
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

function csvCell(value: string): string {
  // Quote if the cell contains comma, quote, CR, or LF; double inner quotes.
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const freeExporters: readonly Exporter<LogArtifact>[] = [
  textPlainExporter,
  plaintextMessagesExporter,
  jsonEntriesExporter,
  csvEntriesExporter,
  markdownSummaryExporter,
];
