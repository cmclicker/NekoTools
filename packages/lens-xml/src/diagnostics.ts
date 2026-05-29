import type { Diagnostic } from '@nekotools/contracts';

/**
 * Helper that produces a Diagnostic while honoring
 * `exactOptionalPropertyTypes` (no `key: undefined`). Mirrors the
 * lens-yaml / lens-env / lens-url / lens-toml helper.
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
 * Canonical NekoXML diagnostic codes (engine MVP).
 *
 *   - xml.empty_input         (info)    — empty / whitespace-only input.
 *   - xml.parse_error         (error)   — malformed markup; carries a 1-based line.
 *   - xml.mismatched_tag      (error)   — a close tag does not match the open tag.
 *   - xml.unclosed_tag        (error)   — EOF reached with tags still open.
 *   - xml.multiple_roots      (warning) — more than one top-level element.
 *   - xml.duplicate_attribute (warning) — an attribute name repeats on an element.
 *   - xml.external_entity      (warning) — a non-builtin entity / DOCTYPE was seen and
 *                                         ignored (NekoXML never resolves externals).
 *
 * Adding a code requires updating this object and the conformance tests
 * in the same PR.
 */
export const XML_DIAGNOSTIC_CODES = {
  emptyInput: 'xml.empty_input',
  parseError: 'xml.parse_error',
  mismatchedTag: 'xml.mismatched_tag',
  unclosedTag: 'xml.unclosed_tag',
  multipleRoots: 'xml.multiple_roots',
  duplicateAttribute: 'xml.duplicate_attribute',
  externalEntity: 'xml.external_entity',
} as const;
