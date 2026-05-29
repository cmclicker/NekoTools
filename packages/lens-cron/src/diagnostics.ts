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
 * Canonical NekoCron diagnostic codes.
 *
 *   - cron.empty_input  (info)    — empty / whitespace-only input.
 *   - cron.parse_error  (error)   — wrong field count or an unparseable token.
 *   - cron.out_of_range (error)   — a value falls outside the field's range.
 *   - cron.unsupported  (error)   — Quartz/Vixie extensions (L, W, #, ?) not handled.
 *   - cron.reboot       (info)    — `@reboot` cannot be scheduled to a time.
 *
 * Adding a code requires updating this object and the conformance tests.
 */
export const CRON_DIAGNOSTIC_CODES = {
  emptyInput: 'cron.empty_input',
  parseError: 'cron.parse_error',
  outOfRange: 'cron.out_of_range',
  unsupported: 'cron.unsupported',
  reboot: 'cron.reboot',
} as const;
