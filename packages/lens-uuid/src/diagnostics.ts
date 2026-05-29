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
 * Canonical NekoUUID diagnostic codes.
 *
 *   - uuid.empty_input (info)    — empty / whitespace-only input.
 *   - uuid.parse_error (warning) — a line is neither a valid UUID nor ULID.
 *
 * Adding a code requires updating this object and the conformance tests.
 */
export const UUID_DIAGNOSTIC_CODES = {
  emptyInput: 'uuid.empty_input',
  parseError: 'uuid.parse_error',
} as const;
