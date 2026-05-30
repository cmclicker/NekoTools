import type { Exporter } from '@nekotools/contracts';

import {
  LOG_ENTRY_EXPORT_KINDS,
  LOG_KIND_DOCUMENT,
  LOG_KIND_FILTER_RESULT,
  LOG_KIND_HISTOGRAM,
  LOG_KIND_SUMMARY,
  LOG_LEVELS,
  LOG_SUMMARY_EXPORT_KINDS,
  type LogArtifact,
  type LogEntry,
  type LogHistogram,
  type LogSummary,
} from './kinds.js';
import { toHistogramSvg, toIncidentReport, toPatternClusters } from './codegen.js';

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

// --- Pro exporters (registered in the binary, gated by entitlement) --------
//
// These back the manifest's declared Pro exporter ids (`report.incident` /
// `histogram.advanced` / `pattern.cluster`). Each is a pure derivation of
// artifacts the FREE `log.text` run already produces (log.summary,
// log.histogram, entries on log.document / log.filter-result) — no network,
// no premium analytics engine. They are honest structural renders, not
// statistical anomaly detection / ML clustering (those stay advertising-only).
// Generators live in `codegen.ts`. The log.graph.trace projector remains
// advertising-only (not registered).

const LOG_INCIDENT_EXPORT_KINDS = [LOG_KIND_SUMMARY, LOG_KIND_DOCUMENT] as const;
const LOG_HISTOGRAM_EXPORT_KINDS = [LOG_KIND_HISTOGRAM] as const;

/** `log.export.report.incident` (Pro) — markdown incident report. */
export const incidentReportExporter: Exporter<LogArtifact> = {
  version: 1,
  id: 'log.export.report.incident',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: LOG_INCIDENT_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const summary = artifacts.find(
      (a): a is LogArtifact & { value: LogSummary } => a.kind === LOG_KIND_SUMMARY,
    )?.value;
    const entries = pickEntries(artifacts);
    const effective: LogSummary =
      summary ?? {
        documentArtifactId: '',
        total: entries.length,
        byLevel: countLevels(entries),
        timeRange: { startMs: null, endMs: null },
        unparseableCount: 0,
        topMessages: [],
      };
    return { mimeType: 'text/markdown', extension: 'md', body: toIncidentReport(effective, entries) };
  },
};

/** `log.export.histogram.svg` (Pro) — stacked-bar SVG of the histogram matrix. */
export const histogramSvgExporter: Exporter<LogArtifact> = {
  version: 1,
  id: 'log.export.histogram.svg',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: LOG_HISTOGRAM_EXPORT_KINDS,
  producesMimeType: 'image/svg+xml',
  producesExtension: 'svg',
  export({ artifacts }) {
    const hist = artifacts.find(
      (a): a is LogArtifact & { value: LogHistogram } => a.kind === LOG_KIND_HISTOGRAM,
    )?.value;
    const body =
      hist === undefined
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"/>'
        : toHistogramSvg(hist);
    return { mimeType: 'image/svg+xml', extension: 'svg', body };
  },
};

/** `log.export.patterns.clusters` (Pro) — message clustering by template. */
export const patternClustersExporter: Exporter<LogArtifact> = {
  version: 1,
  id: 'log.export.patterns.clusters',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: LOG_ENTRY_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    return { mimeType: 'text/markdown', extension: 'md', body: toPatternClusters(pickEntries(artifacts)) };
  },
};

/** Level counts over a bare entry list (incident fallback when no summary). */
function countLevels(entries: readonly LogEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    const key = e.level ?? 'none';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export const proExporters: readonly Exporter<LogArtifact>[] = [
  incidentReportExporter,
  histogramSvgExporter,
  patternClustersExporter,
];
