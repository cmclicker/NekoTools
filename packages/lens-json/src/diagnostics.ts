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
  diffMissingInput: 'json.diff.missing_input',
  largeDocument: 'json.large_document',
  // Reserved for future PRs (charter-declared, not yet implemented):
  // - json.duplicate_key   (Phase 1.1d, depends on tokenizer)
  // - json.trailing_comma  (Phase 1.1d, depends on tokenizer)
} as const;

/**
 * Default soft size threshold for `json.text` parser input, in bytes
 * (counted as `input.raw.length`, which approximates UTF-16 code units;
 * close enough for an *info* heuristic).
 *
 * Chosen at 10 MB — the conservative end of the 10–50 MB range the
 * charter sketched. The diagnostic is informational only: nothing in
 * Phase 1 is blocked above this size. The Pro graph view and other
 * heavy projections (Phase 3) will consume the diagnostic to decide
 * when to refuse a render; until then, this just gives the user a
 * heads-up that subsequent operations may be slow.
 *
 * Per-tool override via `LargeDocumentOptions.largeDocumentBytes`.
 */
export const DEFAULT_LARGE_DOCUMENT_BYTES = 10 * 1024 * 1024;
