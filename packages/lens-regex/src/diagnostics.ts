import type { Diagnostic } from '@nekotools/contracts';

/**
 * Helper that produces a Diagnostic while honoring
 * `exactOptionalPropertyTypes` (no `key: undefined`). Mirrors the
 * lens-yaml / lens-env / lens-json helper.
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
 * Canonical NekoRegex diagnostic codes (Free MVP).
 *
 *   - regex.empty_pattern     (info)    — empty pattern (matches everywhere).
 *   - regex.empty_sample      (info)    — empty sample text.
 *   - regex.invalid_pattern   (error)   — RegExp construction threw on the pattern.
 *   - regex.unsupported_flag  (error)   — flag string has unsupported / duplicate flags.
 *   - regex.expensive_pattern (warning) — heuristic catastrophic-backtracking risk.
 *   - regex.match_limit       (warning) — match list truncated at the configured cap.
 *   - regex.no_matches        (info)    — valid pattern, zero matches in the sample.
 *   - regex.suite_invalid     (error)   — the `cases` hint is missing or not a JSON array.
 *   - regex.suite_empty       (info)    — the suite ran with zero cases.
 *   - regex.suite_failed      (warning) — at least one asserted case did not meet its expected count.
 */
export const REGEX_DIAGNOSTIC_CODES = {
  emptyPattern: 'regex.empty_pattern',
  emptySample: 'regex.empty_sample',
  invalidPattern: 'regex.invalid_pattern',
  unsupportedFlag: 'regex.unsupported_flag',
  expensivePattern: 'regex.expensive_pattern',
  matchLimit: 'regex.match_limit',
  noMatches: 'regex.no_matches',
  suiteInvalid: 'regex.suite_invalid',
  suiteEmpty: 'regex.suite_empty',
  suiteFailed: 'regex.suite_failed',
} as const;

/**
 * Static heuristic for catastrophic-backtracking risk. It flags the
 * classic nested-quantifier shapes — a quantified group whose body itself
 * contains a quantifier, e.g. `(a+)+`, `(.*)*`, `(\d+){2,}`. It does NOT
 * execute the pattern and may over- or under-report: it is a warning, not
 * a proof. Engine doctrine forbids real timeout/ReDoS enforcement here
 * (that is an out-of-scope, Pro-adjacent concern).
 */
const NESTED_QUANTIFIER = /\([^()]*[+*][^()]*\)\s*[+*{]/;

export function detectExpensivePattern(pattern: string): string | null {
  if (pattern.length === 0) return null;
  if (NESTED_QUANTIFIER.test(pattern)) {
    return 'nested quantifier detected (e.g. (a+)+); this can cause catastrophic backtracking on some inputs';
  }
  return null;
}
