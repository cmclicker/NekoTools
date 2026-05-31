import type { Diagnostic, Entitlement } from '@nekotools/contracts';
import {
  CSV_KIND_TABLE,
  buildCsvRegistration,
  type CsvDelimiter,
  type CsvTableArtifact,
  type CsvTableDocument,
} from '@nekotools/lens-csv';
import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';

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
  /** Pro: structural per-column markdown profile, or null when not entitled. */
  readonly profileReport: string | null;
  /** Pro: inferred JSON Schema for one row, or null when not entitled. */
  readonly schemaJson: string | null;
  /** Pro: declarative JSON cleaning recipe, or null when not entitled. */
  readonly cleaningRecipe: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

export function runCsv(
  raw: string,
  delimiter: CsvDelimiter,
  hasHeader: boolean,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): CsvRun {
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
  let profileReport: string | null = null;
  let schemaJson: string | null = null;
  let cleaningRecipe: string | null = null;
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
    // Pro exporters: the engine throws EntitlementError for a free caller, which
    // we surface as null so the UI can show the Pro-lock (same pattern as
    // hex-parse.ts / headers-parse.ts).
    const runPro = (id: string): string | null => {
      try {
        return String(runExporter(registry, 'csv', id, exportInput, entitlement).body);
      } catch {
        return null;
      }
    };
    profileReport = runPro('csv.export.profile.report');
    schemaJson = runPro('csv.export.schema.json');
    cleaningRecipe = runPro('csv.export.cleaning.recipe');
  }

  return {
    table: artifact?.value ?? null,
    jsonSummary,
    markdownSummary,
    normalizedCsv,
    profileReport,
    schemaJson,
    cleaningRecipe,
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}

export type { CsvDelimiter };
