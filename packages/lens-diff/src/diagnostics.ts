import type { Diagnostic } from '@nekotools/contracts';

/**
 * Helper that produces a Diagnostic while honoring
 * `exactOptionalPropertyTypes` (no `key: undefined`). Mirrors the
 * lens-json / lens-yaml helpers.
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
 * Canonical NekoDiff diagnostic codes (vertical-slice MVP).
 *
 *   - diff.empty_input   (info)    — a side is empty / whitespace-only.
 *   - diff.identical     (info)    — the two inputs match (no add/remove).
 *   - diff.parse_error   (error)   — a side failed JSON/YAML parsing.
 *   - diff.large_input   (info)    — a side exceeds the soft byte threshold.
 *   - diff.binary_input  (warning) — a side looks binary (NUL byte present).
 *   - diff.missing_input (error)   — the parser ran without both sides.
 *
 * Adding a code requires updating this object and the conformance tests in
 * the same PR.
 */
export const DIFF_DIAGNOSTIC_CODES = {
  emptyInput: 'diff.empty_input',
  identical: 'diff.identical',
  parseError: 'diff.parse_error',
  largeInput: 'diff.large_input',
  binaryInput: 'diff.binary_input',
  missingInput: 'diff.missing_input',
} as const;

/**
 * Default soft size threshold per side, in **UTF-8 bytes**. 10 MB matches
 * the other lenses. Informational only; nothing is blocked above it.
 * Per-registration override via `BuildDiffRegistrationOptions.largeInputBytes`.
 */
export const DEFAULT_LARGE_INPUT_BYTES = 10 * 1024 * 1024;

const SHARED_UTF8_ENCODER = new TextEncoder();

/** UTF-8 byte length (not `string.length`, which counts UTF-16 code units). */
export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

/**
 * A conservative binary-content heuristic: a NUL (U+0000) never appears in
 * normal UTF-8 text but is ubiquitous in binary payloads. Kept strict (NUL
 * only) to avoid false positives on ordinary text / JSON / YAML. Checking
 * `charCodeAt` avoids embedding a literal NUL byte in this source file.
 */
export function looksBinary(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) === 0) return true;
  }
  return false;
}
