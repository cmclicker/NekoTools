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
 * Canonical NekoCSP diagnostic codes (security-forward).
 *
 *   - csp.empty_input        (info)
 *   - csp.parse_error        (warning) — a segment had no directive name.
 *   - csp.unsafe_inline      (warning) — 'unsafe-inline' in script/style-src.
 *   - csp.unsafe_eval        (warning) — 'unsafe-eval' present.
 *   - csp.wildcard           (warning) — a bare '*' source.
 *   - csp.data_uri           (warning) — data: in script-src.
 *   - csp.missing_directive  (info)    — no default-src / object-src / frame-ancestors.
 *   - csp.duplicate          (warning) — a directive appears twice.
 *
 * Adding a code requires updating this object and the conformance tests.
 */
export const CSP_DIAGNOSTIC_CODES = {
  emptyInput: 'csp.empty_input',
  parseError: 'csp.parse_error',
  unsafeInline: 'csp.unsafe_inline',
  unsafeEval: 'csp.unsafe_eval',
  wildcard: 'csp.wildcard',
  dataUri: 'csp.data_uri',
  missingDirective: 'csp.missing_directive',
  duplicate: 'csp.duplicate',
} as const;
