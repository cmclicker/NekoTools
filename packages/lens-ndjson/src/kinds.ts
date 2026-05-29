import type { Artifact } from '@nekotools/contracts';

/**
 * NekoNDJSON artifact kinds (namespaced under `ndjson.*`).
 *
 *   `ndjson.parsed` — a newline-delimited JSON stream decoded record by
 *                     record, with per-line error isolation (one malformed
 *                     line never sinks the rest), plus an inferred shape
 *                     across the object records. Pure JSON.parse; no network.
 */
export const NDJSON_KIND_PARSED = 'ndjson.parsed';

export const ALL_NDJSON_KINDS = [NDJSON_KIND_PARSED] as const;

export interface NdjsonRecord {
  /** 1-based line number in the source. */
  readonly line: number;
  readonly valid: boolean;
  /** Parsed JSON value, or `null` when the line failed to parse. */
  readonly value: unknown;
  /** JSON value type tag ("object" | "array" | "string" | …), or `null`. */
  readonly type: string | null;
  /** Parse error message when invalid, else `null`. */
  readonly error: string | null;
}

/** One inferred field across the object records. */
export interface NdjsonField {
  readonly key: string;
  /** Distinct JSON types observed for this key, sorted. */
  readonly types: readonly string[];
  /** How many object records contained the key. */
  readonly present: number;
  /** True when the key is absent from at least one object record. */
  readonly optional: boolean;
}

/** The parsed body of an `ndjson.parsed` artifact. */
export interface NdjsonReport {
  readonly count: number;
  readonly validCount: number;
  readonly invalidCount: number;
  readonly records: readonly NdjsonRecord[];
  /** Inferred field shape across object records (empty if not homogeneous objects). */
  readonly fields: readonly NdjsonField[];
  /** True when every valid record is a JSON object. */
  readonly homogeneousObjects: boolean;
}

export type NdjsonParsedArtifact = Artifact<'ndjson.parsed', NdjsonReport>;
export type NdjsonArtifact = NdjsonParsedArtifact;

export const NDJSON_PARSED_EXPORT_KINDS = [NDJSON_KIND_PARSED] as const;
