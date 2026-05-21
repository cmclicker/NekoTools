import type { Diagnostic } from '@nekotools/contracts';

/**
 * Helper that produces a Diagnostic while honoring
 * `exactOptionalPropertyTypes` (no `key: undefined` allowed). Parallel
 * to lens-json's `makeDiagnostic` — duplicated intentionally, see
 * util.ts for the reuse rule.
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
 * Canonical NekoEnv diagnostic codes. Mirror of NekoJSON's
 * `JSON_DIAGNOSTIC_CODES` but namespaced under `env.*`.
 *
 * Implemented in Phase 2.1:
 *   - env.syntax_error
 *   - env.empty_input          (info, per charter §3 — comments-only is valid)
 *   - env.invalid_key
 *   - env.duplicate_key        (warning)
 *   - env.unterminated_quote
 *   - env.shell_export_prefix  (warning)
 *   - env.interpolation_token  (info)
 *   - env.key.not_found        (env.key parser)
 *   - env.large_document       (info, same threshold knob as NekoJSON)
 *   - env.diff.missing_input   (env.diff.textual parser)
 *
 * Codes deliberately NOT in Phase 2.1: `env.value_looks_secret`
 * (Pro vendor-pattern catalog). Adding any new diagnostic requires a
 * follow-up PR that updates this object, the charter's Section 3
 * table, and the monetization-safety tests in the same commit.
 */
export const ENV_DIAGNOSTIC_CODES = {
  syntaxError: 'env.syntax_error',
  emptyInput: 'env.empty_input',
  invalidKey: 'env.invalid_key',
  duplicateKey: 'env.duplicate_key',
  unterminatedQuote: 'env.unterminated_quote',
  shellExportPrefix: 'env.shell_export_prefix',
  interpolationToken: 'env.interpolation_token',
  keyNotFound: 'env.key.not_found',
  largeDocument: 'env.large_document',
  diffMissingInput: 'env.diff.missing_input',
} as const;

/**
 * Default soft size threshold for `env.text` parser input, in UTF-8
 * bytes. Same value (10 MB) as NekoJSON's
 * `DEFAULT_LARGE_DOCUMENT_BYTES` — dotenv files are typically tiny,
 * so the threshold exists mostly to flag pathological inputs (e.g. a
 * giant generated bundle of compose-stack env). Per-registration
 * override via `BuildEnvRegistrationOptions.largeDocumentBytes`.
 *
 * The diagnostic is informational only; nothing in Phase 2 is blocked
 * above it.
 */
export const DEFAULT_LARGE_DOCUMENT_BYTES = 10 * 1024 * 1024;
