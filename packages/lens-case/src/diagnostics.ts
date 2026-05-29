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
 * Canonical NekoCase diagnostic codes.
 *
 *   - case.empty_input (info)    — empty / whitespace-only input.
 *   - case.no_words    (info)    — a line had no word characters to transform.
 *
 * Adding a code requires updating this object and the conformance tests.
 */
export const CASE_DIAGNOSTIC_CODES = {
  emptyInput: 'case.empty_input',
  noWords: 'case.no_words',
} as const;
