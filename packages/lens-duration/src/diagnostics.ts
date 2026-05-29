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
 * Canonical NekoDuration diagnostic codes.
 *
 *   - duration.empty_input (info)    — empty / whitespace-only input.
 *   - duration.parse_error (warning) — a line is not a recognizable duration.
 *   - duration.approximate (info)    — input used years/months (average lengths).
 *
 * Adding a code requires updating this object and the conformance tests.
 */
export const DURATION_DIAGNOSTIC_CODES = {
  emptyInput: 'duration.empty_input',
  parseError: 'duration.parse_error',
  approximate: 'duration.approximate',
} as const;
