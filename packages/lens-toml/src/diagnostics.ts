import type { Diagnostic } from '@nekotools/contracts';

/**
 * Helper that produces a Diagnostic while honoring
 * `exactOptionalPropertyTypes` (no `key: undefined`). Mirrors the
 * lens-yaml / lens-env / lens-url helper.
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
 * Canonical NekoTOML diagnostic codes (engine MVP).
 *
 *   - toml.empty_input    (info)    — empty / whitespace-only / comment-only input.
 *   - toml.parse_error    (error)   — a line could not be decoded; carries the
 *                                     1-based line number in its message.
 *   - toml.duplicate_key  (warning) — a key is assigned twice in the same table.
 *   - toml.unsupported     (warning) — a valid-TOML construct this MVP slice does
 *                                     not decode (multi-line strings/arrays); the
 *                                     line is skipped rather than silently mis-parsed.
 *
 * Adding a code requires updating this object and the conformance tests
 * in the same PR.
 */
export const TOML_DIAGNOSTIC_CODES = {
  emptyInput: 'toml.empty_input',
  parseError: 'toml.parse_error',
  duplicateKey: 'toml.duplicate_key',
  unsupported: 'toml.unsupported',
} as const;
