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
 * Canonical NekoUnicode diagnostic codes.
 *
 *   - unicode.empty_input (info) — empty input.
 *   - unicode.truncated   (info) — per-codepoint detail capped for a long string.
 *   - unicode.control     (info) — input contains control characters.
 *
 * Adding a code requires updating this object and the conformance tests.
 */
export const UNICODE_DIAGNOSTIC_CODES = {
  emptyInput: 'unicode.empty_input',
  truncated: 'unicode.truncated',
  control: 'unicode.control',
} as const;
