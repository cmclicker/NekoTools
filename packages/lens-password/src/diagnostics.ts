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
 * Canonical NekoPassword diagnostic codes.
 *
 *   - password.empty_input (info)              — empty input.
 *   - password.pattern     (warning)           — a detected weakening pattern.
 *   - password.assessment  (error/warning/info) — the overall verdict, severity by score.
 *
 * Adding a code requires updating this object and the conformance tests.
 */
export const PASSWORD_DIAGNOSTIC_CODES = {
  emptyInput: 'password.empty_input',
  pattern: 'password.pattern',
  assessment: 'password.assessment',
} as const;
