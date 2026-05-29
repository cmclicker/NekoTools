import type { Artifact } from '@nekotools/contracts';

export const CSV_KIND_TABLE = 'csv.table';

export type CsvDelimiter = 'comma' | 'tab';

export interface CsvRow {
  readonly line: number;
  readonly cells: readonly string[];
  readonly record: Readonly<Record<string, string>>;
}

export interface CsvTableDocument {
  readonly valid: boolean;
  readonly delimiter: CsvDelimiter;
  readonly hasHeader: boolean;
  readonly columns: readonly string[];
  readonly rows: readonly CsvRow[];
  readonly rowCount: number;
  readonly columnCount: number;
  readonly emptyCellCount: number;
}

export type CsvTableArtifact = Artifact<typeof CSV_KIND_TABLE, CsvTableDocument>;

export type CsvArtifact = CsvTableArtifact;

export const CSV_EXPORT_KINDS = [CSV_KIND_TABLE] as const;
