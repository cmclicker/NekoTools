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
 * Canonical NekoSort diagnostic codes.
 *
 *   - sort.empty_input    (info) — empty / whitespace-only input.
 *   - sort.removed_lines  (info) — lines were dropped (dedupe / blank removal).
 *
 * Adding a code requires updating this object and the conformance tests.
 */
export const SORT_DIAGNOSTIC_CODES = {
  emptyInput: 'sort.empty_input',
  removedLines: 'sort.removed_lines',
} as const;
