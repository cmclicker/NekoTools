import type { Diagnostic } from '@nekotools/contracts';

/**
 * Helper that produces a Diagnostic while honoring
 * `exactOptionalPropertyTypes`. Mirrors the other lenses' helper.
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
 * Canonical NekoNDJSON diagnostic codes.
 *
 *   - ndjson.empty_input  (info)    — empty / whitespace-only input.
 *   - ndjson.parse_error  (warning) — a line is not valid JSON (carries the line #).
 *   - ndjson.mixed_shape  (info)    — valid records are not all objects (shape skipped).
 *
 * Adding a code requires updating this object and the conformance tests.
 */
export const NDJSON_DIAGNOSTIC_CODES = {
  emptyInput: 'ndjson.empty_input',
  parseError: 'ndjson.parse_error',
  mixedShape: 'ndjson.mixed_shape',
} as const;
