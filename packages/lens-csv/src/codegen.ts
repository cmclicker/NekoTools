import type { CsvTableDocument } from './kinds.js';

/**
 * NekoCSV Pro generators. Back the declared Pro exporters
 * `csv.export.profile.report` (pro `profile.columns`),
 * `csv.export.schema.json` (pro `infer.schema` / `detect.types`), and
 * `csv.export.cleaning.recipe` (pro `batch.clean`).
 *
 * All three are pure, deterministic functions of a parsed `csv.table`
 * document — no network, no clock, no premium engine. Per the manifest's
 * out-of-scope note ("statistical profiling beyond structural CSV
 * diagnostics"), the profile stays STRUCTURAL: per-column fill / blank /
 * distinct counts + a detected type. No means, medians, quantiles, or
 * histograms.
 */

export type CsvColumnType = 'integer' | 'number' | 'boolean' | 'empty' | 'string';

export interface CsvColumnProfile {
  readonly column: string;
  /** Non-empty cell count across the data rows. */
  readonly filled: number;
  /** Empty-string cell count across the data rows. */
  readonly blank: number;
  /** Distinct non-empty values seen. */
  readonly distinct: number;
  /** Structural type detected from the non-empty cells. */
  readonly type: CsvColumnType;
}

const INT_RE = /^[+-]?\d+$/;
const NUM_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function isBooleanish(v: string): boolean {
  const t = v.toLowerCase();
  return t === 'true' || t === 'false';
}

/**
 * Detect a single column's structural type from its non-empty cells:
 * `empty` (no non-empty cells), `integer` / `number` (every cell numeric),
 * `boolean` (every cell true/false, case-insensitive), else `string`.
 */
export function detectColumnType(cells: readonly string[]): CsvColumnType {
  const nonEmpty = cells.filter((c) => c !== '');
  if (nonEmpty.length === 0) return 'empty';
  if (nonEmpty.every((c) => INT_RE.test(c))) return 'integer';
  if (nonEmpty.every((c) => NUM_RE.test(c))) return 'number';
  if (nonEmpty.every(isBooleanish)) return 'boolean';
  return 'string';
}

/** Column-major cells for a column index across all data rows. */
function columnCells(table: CsvTableDocument, index: number): string[] {
  return table.rows.map((r) => r.cells[index] ?? '');
}

/** Per-column structural profile of the table. */
export function profileColumns(table: CsvTableDocument): CsvColumnProfile[] {
  return table.columns.map((column, i) => {
    const cells = columnCells(table, i);
    const nonEmpty = cells.filter((c) => c !== '');
    return {
      column,
      filled: nonEmpty.length,
      blank: cells.length - nonEmpty.length,
      distinct: new Set(nonEmpty).size,
      type: detectColumnType(cells),
    };
  });
}

/** A JSON-Schema `type` keyword for a detected column type. */
function schemaTypeOf(type: CsvColumnType): string {
  switch (type) {
    case 'integer':
      return 'integer';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'empty':
    case 'string':
      return 'string';
  }
}

// --- profile.report --------------------------------------------------------

/**
 * `csv.export.profile.report` — a structural markdown column profile:
 * row/column counts, then a per-column table of fill rate, blank count,
 * distinct count, and detected type.
 */
export function toProfileReport(table: CsvTableDocument): string {
  const out: string[] = ['# NekoCSV column profile', ''];
  out.push(
    `- rows: ${table.rowCount}`,
    `- columns: ${table.columnCount}`,
    `- empty cells: ${table.emptyCellCount}`,
    '',
  );
  const profiles = profileColumns(table);
  if (profiles.length === 0) {
    out.push('(no columns)');
    return out.join('\n');
  }
  out.push('| column | type | filled | blank | distinct | fill rate |', '| --- | --- | --- | --- | --- | --- |');
  for (const p of profiles) {
    const total = p.filled + p.blank;
    const rate = total === 0 ? '—' : `${Math.round((p.filled / total) * 100)}%`;
    out.push(`| \`${p.column}\` | ${p.type} | ${p.filled} | ${p.blank} | ${p.distinct} | ${rate} |`);
  }
  out.push('');
  return out.join('\n');
}

// --- schema.json -----------------------------------------------------------

/** A minimal JSON-Schema node (local to lens-csv — no cross-tool dep). */
export interface JsonSchemaNode {
  readonly $schema?: string;
  readonly type?: string;
  readonly properties?: Readonly<Record<string, { readonly type: string }>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

/**
 * `csv.export.schema.json` — an inferred JSON Schema describing one row as an
 * object: each column a property typed from `detectColumnType`, every
 * fully-populated column `required`, open-world `additionalProperties: true`.
 */
export function inferRowSchema(table: CsvTableDocument): JsonSchemaNode {
  const profiles = profileColumns(table);
  const properties: Record<string, { type: string }> = {};
  const required: string[] = [];
  for (const p of profiles) {
    properties[p.column] = { type: schemaTypeOf(p.type) };
    if (p.blank === 0 && table.rowCount > 0) required.push(p.column);
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties,
    required,
    additionalProperties: true,
  };
}

// --- cleaning.recipe -------------------------------------------------------

export interface CleaningStep {
  readonly op: string;
  readonly target?: string;
  readonly reason: string;
}

export interface CleaningRecipe {
  readonly tool: 'csv';
  readonly generatedFrom: { readonly rows: number; readonly columns: number };
  readonly steps: readonly CleaningStep[];
}

/**
 * `csv.export.cleaning.recipe` — a declarative JSON recipe of cleaning steps
 * inferred from the table's observed structure. It DESCRIBES what a cleaning
 * pass would do (the batch.clean Pro engine would apply it); this exporter
 * applies nothing. Steps are derived from real signals: blank-heavy columns,
 * untrimmed whitespace, fully-empty columns, header-derived dedupe.
 */
export function toCleaningRecipe(table: CsvTableDocument): CleaningRecipe {
  const steps: CleaningStep[] = [];
  const profiles = profileColumns(table);

  for (const p of profiles) {
    if (p.filled === 0 && (p.blank > 0 || table.rowCount > 0)) {
      steps.push({ op: 'drop-column', target: p.column, reason: 'column is empty in every row' });
    } else if (p.blank > 0) {
      steps.push({
        op: 'fill-blanks',
        target: p.column,
        reason: `${p.blank} blank cell(s); fill with a default or sentinel`,
      });
    }
  }

  // Untrimmed whitespace anywhere in the data.
  const hasUntrimmed = table.rows.some((r) => r.cells.some((c) => c !== c.trim()));
  if (hasUntrimmed) {
    steps.push({ op: 'trim-whitespace', reason: 'leading/trailing whitespace found in some cells' });
  }

  // Fully-duplicate data rows (same cell tuple) → dedupe.
  const seen = new Set<string>();
  let dupes = 0;
  for (const r of table.rows) {
    const key = JSON.stringify(r.cells);
    if (seen.has(key)) dupes += 1;
    else seen.add(key);
  }
  if (dupes > 0) {
    steps.push({ op: 'dedupe-rows', reason: `${dupes} duplicate row(s) detected` });
  }

  return {
    tool: 'csv',
    generatedFrom: { rows: table.rowCount, columns: table.columnCount },
    steps,
  };
}
