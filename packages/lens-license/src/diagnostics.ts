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
 * Canonical NekoLicense diagnostic codes.
 *
 *   - license.empty_input (info)    — empty input.
 *   - license.detected    (info)    — a license was identified.
 *   - license.unknown     (warning) — no known license signature matched.
 *   - license.tag_mismatch (warning) — SPDX tag disagrees with the detected text.
 *
 * Adding a code requires updating this object and the conformance tests.
 */
export const LICENSE_DIAGNOSTIC_CODES = {
  emptyInput: 'license.empty_input',
  detected: 'license.detected',
  unknown: 'license.unknown',
  tagMismatch: 'license.tag_mismatch',
} as const;
