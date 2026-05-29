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
 * Canonical NekoSemver diagnostic codes.
 *
 *   - semver.empty_input (info)    — empty / whitespace-only input.
 *   - semver.parse_error (warning) — a line is not a valid semantic version.
 *   - semver.range_error (warning) — the supplied range could not be parsed.
 *
 * Adding a code requires updating this object and the conformance tests.
 */
export const SEMVER_DIAGNOSTIC_CODES = {
  emptyInput: 'semver.empty_input',
  parseError: 'semver.parse_error',
  rangeError: 'semver.range_error',
} as const;
