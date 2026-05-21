import type { Diagnostic } from '@nekotools/contracts';

/**
 * Helper that produces a Diagnostic while honoring
 * `exactOptionalPropertyTypes`. Same shape as the other lenses'
 * helper (small enough that it is not worth a shared package — only
 * the clock/id-factory trio crossed the extraction threshold).
 */
export function makeDiagnostic(
  id: string,
  severity: Diagnostic['severity'],
  code: string,
  message: string,
  span?: Diagnostic['span'],
  hint?: string,
): Diagnostic {
  const d: { -readonly [K in keyof Diagnostic]: Diagnostic[K] } = {
    version: 1,
    id,
    severity,
    code,
    message,
  };
  if (span !== undefined) d.span = span;
  if (hint !== undefined) d.hint = hint;
  return d;
}

/**
 * Canonical NekoLogs diagnostic codes (charter §3).
 *
 * Implemented in the engine MVP:
 *   - log.empty_input        (info)
 *   - log.unparseable_line   (info, emitted once with a count)
 *   - log.mixed_formats      (info)
 *   - log.timestamp_unparsed (info, emitted once with a count)
 *   - log.large_document     (info)
 *   - log.filter.invalid     (error, from log.filter)
 *
 * Pro (not in this build): log.anomaly, log.pattern_cluster.
 */
export const LOG_DIAGNOSTIC_CODES = {
  emptyInput: 'log.empty_input',
  unparseableLine: 'log.unparseable_line',
  mixedFormats: 'log.mixed_formats',
  timestampUnparsed: 'log.timestamp_unparsed',
  largeDocument: 'log.large_document',
  filterInvalid: 'log.filter.invalid',
} as const;

/**
 * Default soft size threshold for `log.text` input, in UTF-8 bytes.
 * Same 10 MB value + per-registration knob as NekoJSON / NekoEnv.
 * Informational only — nothing is blocked above it.
 */
export const DEFAULT_LARGE_DOCUMENT_BYTES = 10 * 1024 * 1024;
