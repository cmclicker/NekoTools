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
 * Canonical NekoMIME diagnostic codes.
 *
 *   - mime.empty_input (info)    — empty / whitespace-only input.
 *   - mime.parse_error (warning) — not a valid type/subtype nor a known extension.
 *   - mime.unknown     (info)    — valid Content-Type, but not in the built-in table.
 *
 * Adding a code requires updating this object and the conformance tests.
 */
export const MIME_DIAGNOSTIC_CODES = {
  emptyInput: 'mime.empty_input',
  parseError: 'mime.parse_error',
  unknown: 'mime.unknown',
} as const;
