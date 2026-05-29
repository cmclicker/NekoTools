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
 * Canonical NekoINI diagnostic codes.
 *
 *   - ini.empty_input       (info)    — empty / whitespace-only / comment-only input.
 *   - ini.parse_error       (warning) — a non-comment line is neither a section nor key=value.
 *   - ini.duplicate_key     (warning) — a key repeats within a section (first value kept).
 *   - ini.duplicate_section (info)    — a section header repeats (entries merge).
 *
 * Adding a code requires updating this object and the conformance tests.
 */
export const INI_DIAGNOSTIC_CODES = {
  emptyInput: 'ini.empty_input',
  parseError: 'ini.parse_error',
  duplicateKey: 'ini.duplicate_key',
  duplicateSection: 'ini.duplicate_section',
} as const;
