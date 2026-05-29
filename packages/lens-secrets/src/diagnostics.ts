import type { Diagnostic } from '@nekotools/contracts';

import type { SecretSeverity } from './kinds.js';

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
 * Canonical NekoSecrets diagnostic codes.
 *
 *   - secret.empty_input (info)              — empty / whitespace-only input.
 *   - secret.clean      (info)               — scanned, nothing flagged.
 *   - secret.finding    (high→error / medium→warning / low→info) — one per finding.
 *
 * Adding a code requires updating this object and the conformance tests.
 */
export const SECRET_DIAGNOSTIC_CODES = {
  emptyInput: 'secret.empty_input',
  clean: 'secret.clean',
  finding: 'secret.finding',
} as const;

/** Map a finding severity onto a diagnostic severity. */
export function toDiagnosticSeverity(severity: SecretSeverity): Diagnostic['severity'] {
  if (severity === 'high') return 'error';
  if (severity === 'medium') return 'warning';
  return 'info';
}
