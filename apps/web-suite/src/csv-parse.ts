import type { Diagnostic } from '@nekotools/contracts';
import {
  CSV_KIND_TABLE,
  buildCsvRegistration,
  type CsvDelimiter,
  type CsvTableArtifact,
  type CsvTableDocument,
} from '@nekotools/lens-csv';
import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';

const SHARED_UTF8_ENCODER = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildCsvRegistration());
  return r;
})();

export interface CsvRun {
  readonly table: CsvTableDocument | null;
  readonly jsonSummary: string | null;
  readonly markdownSummary: string | null;
  readonly normalizedCsv: string | null;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

export function runCsv(raw: string, delimiter: CsvDelimiter, hasHeader: boolean): CsvRun {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'csv', 'csv.text', {
    raw,
    source: { kind: 'paste', bytes },
    hints: { delimiter, hasHeader },
  });

  const artifact = result.artifacts.find(
    (a): a is CsvTableArtifact => a.kind === CSV_KIND_TABLE,
  );

  let jsonSummary: string | null = null;
  let markdownSummary: string | null = null;
  let normalizedCsv: string | null = null;
  if (artifact !== undefined) {
    const exportInput = {
      artifacts: [artifact],
      diagnostics: result.diagnostics,
    };
    jsonSummary = String(runExporter(registry, 'csv', 'csv.export.summary.json', exportInput).body);
    markdownSummary = String(
      runExporter(registry, 'csv', 'csv.export.markdown.summary', exportInput).body,
    );
    normalizedCsv = String(
      runExporter(registry, 'csv', 'csv.export.normalized.csv', exportInput).body,
    );
  }

  return {
    table: artifact?.value ?? null,
    jsonSummary,
    markdownSummary,
    normalizedCsv,
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}

export type { CsvDelimiter };
