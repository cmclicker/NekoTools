import type { Diagnostic } from '@nekotools/contracts';

/**
 * Helper that produces a Diagnostic while honoring
 * `exactOptionalPropertyTypes` (never sets `key: undefined`). Mirrors the
 * lens-json / lens-env / lens-yaml helper.
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
 * Canonical NekoTime diagnostic codes (free engine MVP).
 *
 *   - time.empty_input     (info)    — blank input; no instant produced.
 *   - time.invalid_input   (error)   — not a recognizable timestamp/date.
 *   - time.ambiguous_input (warning) — parsed via the host locale date
 *                                      parser; the result can depend on
 *                                      locale and runtime. Prefer ISO-8601.
 *   - time.out_of_range    (error)   — numeric value outside the JS Date
 *                                      representable range (±8.64e15 ms).
 *   - time.unit_heuristic  (info)    — a bare number was read as Unix
 *                                      seconds or milliseconds; the note
 *                                      states which and shows the alternate.
 *
 * Adding a code requires updating this object and the conformance tests
 * in the same PR.
 */
export const TIME_DIAGNOSTIC_CODES = {
  emptyInput: 'time.empty_input',
  invalidInput: 'time.invalid_input',
  ambiguousInput: 'time.ambiguous_input',
  outOfRange: 'time.out_of_range',
  unitHeuristic: 'time.unit_heuristic',
} as const;
