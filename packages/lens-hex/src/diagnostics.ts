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
 * Canonical NekoHex diagnostic codes.
 *
 *   - hex.empty_input (info)    — empty input.
 *   - hex.odd_length  (error)   — hex-mode input has an odd number of hex digits.
 *   - hex.invalid     (error)   — hex-mode input contains a non-hex character.
 *
 * Adding a code requires updating this object and the conformance tests.
 */
export const HEX_DIAGNOSTIC_CODES = {
  emptyInput: 'hex.empty_input',
  oddLength: 'hex.odd_length',
  invalid: 'hex.invalid',
} as const;
