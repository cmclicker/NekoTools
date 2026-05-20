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
 * Canonical NekoJSON diagnostic codes.
 *
 * Implemented:
 *   - json.syntax_error
 *   - json.empty_input
 *   - json.pointer.invalid
 *   - json.pointer.unresolved
 *   - json.diff.missing_input
 *   - json.large_document       (Phase 1.1b)
 *   - json.duplicate_key        (Phase 1.1d — token-stream walker)
 *   - json.trailing_comma       (Phase 1.1d — token-stream walker)
 *
 * No codes are currently reserved-only. The remaining Phase 1.1+
 * follow-ups (UI views, search, copy) do not introduce new diagnostic
 * codes.
 */
export const JSON_DIAGNOSTIC_CODES = {
  syntaxError: 'json.syntax_error',
  emptyInput: 'json.empty_input',
  pointerUnresolved: 'json.pointer.unresolved',
  pointerInvalid: 'json.pointer.invalid',
  diffMissingInput: 'json.diff.missing_input',
  largeDocument: 'json.large_document',
  duplicateKey: 'json.duplicate_key',
  trailingComma: 'json.trailing_comma',
} as const;

/**
 * Default soft size threshold for `json.text` parser input, in **UTF-8
 * bytes**.
 *
 * The parser measures input size with `TextEncoder.encode().byteLength`,
 * not with `input.raw.length` (which would count UTF-16 code units and
 * under-count non-ASCII payloads). The `*Bytes` naming throughout the
 * lens is therefore honest at the boundary.
 *
 * Chosen at 10 MB — the conservative end of the 10–50 MB range the
 * charter sketched. The diagnostic is informational only: nothing in
 * Phase 1 is blocked above this size. The Pro graph view and other
 * heavy projections (Phase 3) will consume the diagnostic to decide
 * when to refuse a render; until then, this just gives the user a
 * heads-up that subsequent operations may be slow.
 *
 * Per-registration override via
 * `BuildJsonRegistrationOptions.largeDocumentBytes`.
 */
export const DEFAULT_LARGE_DOCUMENT_BYTES = 10 * 1024 * 1024;
