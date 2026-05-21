import type { Artifact } from '@nekotools/contracts';

/**
 * NekoLogs artifact kinds.
 *
 *   `log.document`      — a parsed log document: an ordered list of
 *                         `LogEntry` records plus the detected line
 *                         formats.
 *   `log.filter-result` — the ordered subset of a document's entries
 *                         matching a structured filter, plus the
 *                         filter that produced it. Parallel to
 *                         NekoJSON's `json.path-result` and NekoEnv's
 *                         `env.key-result`.
 *   `log.summary`       — aggregate stats over a document. Produced by
 *                         the `log.text` run (not a separate stage).
 *   `log.histogram`     — a (level × time-bucket) count matrix. Also
 *                         produced by the `log.text` run. The "matrix"
 *                         projection NekoLogs exercises.
 */
export type LogDocumentArtifact = Artifact<'log.document', LogDocument>;
export type LogFilterResultArtifact = Artifact<'log.filter-result', LogFilterResult>;
export type LogSummaryArtifact = Artifact<'log.summary', LogSummary>;
export type LogHistogramArtifact = Artifact<'log.histogram', LogHistogram>;

export type LogArtifact =
  | LogDocumentArtifact
  | LogFilterResultArtifact
  | LogSummaryArtifact
  | LogHistogramArtifact;

export const LOG_KIND_DOCUMENT = 'log.document';
export const LOG_KIND_FILTER_RESULT = 'log.filter-result';
export const LOG_KIND_SUMMARY = 'log.summary';
export const LOG_KIND_HISTOGRAM = 'log.histogram';

export const ALL_LOG_KINDS = [
  LOG_KIND_DOCUMENT,
  LOG_KIND_FILTER_RESULT,
  LOG_KIND_SUMMARY,
  LOG_KIND_HISTOGRAM,
] as const;

/**
 * Per-exporter accept lists. Exporters that render entry rows accept
 * both `log.document` and `log.filter-result` (both carry entries);
 * the summary exporter accepts only `log.summary`. Same narrow-accepts
 * discipline as NekoJSON post-PR #4.
 */
export const LOG_ENTRY_EXPORT_KINDS = [LOG_KIND_DOCUMENT, LOG_KIND_FILTER_RESULT] as const;
export const LOG_SUMMARY_EXPORT_KINDS = [LOG_KIND_SUMMARY] as const;

/**
 * Canonical, severity-ordered log levels. `unknown` is the bucket for
 * a recognized-but-unmapped level token; `none` (used in count maps)
 * is the absence of any level.
 */
export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Severity rank for `minLevel` comparisons. Higher = more severe. */
export const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

export type LogLineFormat = 'json' | 'logfmt' | 'plain';

/**
 * A single parsed log line. `message` is always present (it falls back
 * to the raw line). `timestamp` is the normalized ISO string when a
 * timestamp parsed; `timestampMs` is its epoch-millis form for
 * bucketing. `level` is the normalized canonical level, or omitted.
 * `fields` holds remaining structured key/values (stringified).
 */
export interface LogEntry {
  readonly lineNumber: number;
  readonly raw: string;
  readonly format: LogLineFormat;
  readonly message: string;
  readonly level?: LogLevel;
  readonly timestamp?: string;
  readonly timestampMs?: number;
  readonly fields: Readonly<Record<string, string>>;
}

export interface LogDocument {
  readonly entries: readonly LogEntry[];
  /** Distinct line formats detected across the document, in first-seen order. */
  readonly detectedFormats: readonly LogLineFormat[];
}

/**
 * A structured filter. All present predicates combine with AND. This
 * is not a query DSL — it is a plain object passed through parser
 * hints. `fieldEquals` matches against `entry.fields[key]`.
 */
export interface LogFilter {
  readonly minLevel?: LogLevel;
  readonly levelIn?: readonly LogLevel[];
  readonly messageContains?: string;
  readonly fieldEquals?: { readonly key: string; readonly value: string };
  readonly since?: string;
  readonly until?: string;
}

export interface LogFilterResult {
  readonly documentArtifactId: string;
  readonly filter: LogFilter;
  readonly entries: readonly LogEntry[];
  readonly matchedCount: number;
  readonly totalCount: number;
}

/** A level→count map. Keys are `LogLevel` values plus `'none'` and `'unknown'`. */
export type LevelCounts = Readonly<Record<string, number>>;

export interface LogSummary {
  readonly documentArtifactId: string;
  readonly total: number;
  readonly byLevel: LevelCounts;
  readonly timeRange: { readonly startMs: number | null; readonly endMs: number | null };
  readonly unparseableCount: number;
  readonly topMessages: readonly { readonly message: string; readonly count: number }[];
}

export interface LogHistogramBucket {
  readonly index: number;
  readonly startMs: number;
  readonly counts: LevelCounts;
}

export interface LogHistogram {
  readonly documentArtifactId: string;
  readonly bucketCount: number;
  readonly bucketWidthMs: number | null;
  readonly startMs: number | null;
  readonly levels: readonly string[];
  readonly buckets: readonly LogHistogramBucket[];
  /** Counts for entries that have no usable timestamp. */
  readonly untimed: LevelCounts;
}
