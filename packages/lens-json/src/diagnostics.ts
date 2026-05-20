import type { Diagnostic } from '@nekotools/contracts';

/**
 * Helper that produces a Diagnostic while honoring
 * `exactOptionalPropertyTypes` (no `key: undefined` allowed).
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
 * Canonical NekoJSON diagnostic codes. Codes that are declared in the
 * charter but not yet implemented (duplicate_key, trailing_comma,
 * large_document) are kept here as documentation only — their
 * implementation is deferred. Their codes are reserved so a follow-up
 * PR cannot accidentally re-use the names with a different meaning.
 */
export const JSON_DIAGNOSTIC_CODES = {
  syntaxError: 'json.syntax_error',
  emptyInput: 'json.empty_input',
  pointerUnresolved: 'json.pointer.unresolved',
  pointerInvalid: 'json.pointer.invalid',
  // Reserved for future PRs (charter-declared, not yet implemented):
  // - json.duplicate_key
  // - json.trailing_comma
  // - json.large_document
} as const;
