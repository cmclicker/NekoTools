import type { Diagnostic } from '@nekotools/contracts';

/**
 * Helper that produces a Diagnostic while honoring
 * `exactOptionalPropertyTypes` (no `key: undefined`). Mirrors the
 * lens-env / lens-json helper.
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
 * Canonical NekoYAML diagnostic codes (engine MVP).
 *
 *   - yaml.empty_input        (info)    — zero parseable documents.
 *   - yaml.syntax_error       (error)   — any parse error not specially classified.
 *   - yaml.tab_indentation    (error)   — a tab used for indentation (yaml TAB_AS_INDENT).
 *   - yaml.duplicate_key      (warning) — a mapping key repeated (yaml DUPLICATE_KEY).
 *   - yaml.unresolved_alias   (error)   — an alias with no matching anchor.
 *   - yaml.multiple_documents (info)    — the stream has more than one document.
 *   - yaml.large_document     (info)    — input exceeds the soft byte threshold.
 *
 * Adding a code requires updating this object, the charter Section 3
 * table, and the conformance tests in the same PR.
 */
export const YAML_DIAGNOSTIC_CODES = {
  emptyInput: 'yaml.empty_input',
  syntaxError: 'yaml.syntax_error',
  tabIndentation: 'yaml.tab_indentation',
  duplicateKey: 'yaml.duplicate_key',
  unresolvedAlias: 'yaml.unresolved_alias',
  multipleDocuments: 'yaml.multiple_documents',
  largeDocument: 'yaml.large_document',
} as const;

/**
 * Default soft size threshold for `yaml.text` input, in UTF-8 bytes.
 * Same 10 MB value + per-registration override knob as the other lenses.
 * Informational only; nothing is blocked above it.
 */
export const DEFAULT_LARGE_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * Map a `yaml`-library issue code to a NekoYAML diagnostic code +
 * severity. Unknown codes fall back to `yaml.syntax_error` at the issue's
 * original severity.
 */
export function mapIssueCode(
  code: string,
  fallbackSeverity: Diagnostic['severity'],
): { readonly code: string; readonly severity: Diagnostic['severity'] } {
  switch (code) {
    case 'TAB_AS_INDENT':
      return { code: YAML_DIAGNOSTIC_CODES.tabIndentation, severity: 'error' };
    case 'DUPLICATE_KEY':
      return { code: YAML_DIAGNOSTIC_CODES.duplicateKey, severity: 'warning' };
    case 'UNRESOLVED_ALIAS':
      return { code: YAML_DIAGNOSTIC_CODES.unresolvedAlias, severity: 'error' };
    default:
      return { code: YAML_DIAGNOSTIC_CODES.syntaxError, severity: fallbackSeverity };
  }
}
