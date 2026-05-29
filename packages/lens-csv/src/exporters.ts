import type { Exporter } from '@nekotools/contracts';

import {
  CSV_EXPORT_KINDS,
  CSV_KIND_TABLE,
  type CsvArtifact,
  type CsvTableArtifact,
} from './kinds.js';

const TOOL_ID = 'csv';

function pickTable(artifacts: readonly CsvArtifact[]): CsvTableArtifact | undefined {
  return artifacts.find((artifact): artifact is CsvTableArtifact => artifact.kind === CSV_KIND_TABLE);
}

export const jsonSummaryExporter: Exporter<CsvArtifact> = {
  version: 1,
  id: 'csv.export.summary.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: CSV_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts, diagnostics }) {
    const table = pickTable(artifacts);
    const summary =
      table === undefined
        ? {}
        : {
            ...table.value,
            diagnostics: diagnostics.map((diagnostic) => ({
              severity: diagnostic.severity,
              code: diagnostic.code,
              message: diagnostic.message,
            })),
          };
    return {
      mimeType: 'application/json',
      extension: 'json',
      body: JSON.stringify(summary, null, 2),
    };
  },
};

export const markdownSummaryExporter: Exporter<CsvArtifact> = {
  version: 1,
  id: 'csv.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: CSV_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const table = pickTable(artifacts);
    const lines: string[] = ['# NekoCSV summary', ''];

    if (table === undefined) {
      lines.push('(no CSV table)', '');
    } else {
      const value = table.value;
      lines.push(
        `- **delimiter** - ${value.delimiter}`,
        `- **header row** - ${String(value.hasHeader)}`,
        `- **columns** - ${value.columnCount}`,
        `- **rows** - ${value.rowCount}`,
        `- **empty cells** - ${value.emptyCellCount}`,
        '',
      );
      if (value.columns.length > 0) {
        lines.push('## Columns', '', ...value.columns.map((column) => `- \`${column}\``), '');
      }
    }

    if (diagnostics.length > 0) {
      lines.push('## Diagnostics', '');
      for (const diagnostic of diagnostics) {
        lines.push(
          `- **${diagnostic.severity.toUpperCase()}** \`${diagnostic.code}\` - ${diagnostic.message}`,
        );
      }
      lines.push('');
    }

    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const normalizedCsvExporter: Exporter<CsvArtifact> = {
  version: 1,
  id: 'csv.export.normalized.csv',
  toolId: TOOL_ID,
  target: 'csv',
  accepts: CSV_EXPORT_KINDS,
  producesMimeType: 'text/csv',
  producesExtension: 'csv',
  export({ artifacts }) {
    const table = pickTable(artifacts);
    const lines: string[] = [];
    if (table !== undefined) {
      if (table.value.hasHeader) lines.push(serializeRow(table.value.columns));
      for (const row of table.value.rows) lines.push(serializeRow(row.cells));
    }
    return { mimeType: 'text/csv', extension: 'csv', body: lines.join('\n') };
  },
};

function serializeRow(cells: readonly string[]): string {
  return cells.map(serializeCell).join(',');
}

function serializeCell(cell: string): string {
  if (!/[",\r\n]/.test(cell)) return cell;
  return `"${cell.replace(/"/g, '""')}"`;
}

export const freeExporters: readonly Exporter<CsvArtifact>[] = [
  jsonSummaryExporter,
  markdownSummaryExporter,
  normalizedCsvExporter,
];
