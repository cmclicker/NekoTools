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
 * Canonical NekoHash diagnostic codes (engine MVP).
 *
 *   - hash.empty_input            (info)  — zero input bytes. The digest of
 *                                           zero bytes is still well-defined
 *                                           and is produced.
 *   - hash.unsupported_algorithm  (error) — an algorithm outside SHA-256 /
 *                                           SHA-384 / SHA-512 was requested.
 *   - hash.file_read_failure      (error) — the browser File API failed to
 *                                           read a selected file (surfaced
 *                                           by the UI, code defined here).
 *   - hash.large_input            (info)  — input exceeds the soft byte
 *                                           threshold. Informational only.
 *   - hash.crypto_unavailable     (error) — defensive: Web Crypto
 *                                           (`crypto.subtle`) is missing in
 *                                           the host environment. Never hit
 *                                           in browsers or Node >= 20.
 */
export const HASH_DIAGNOSTIC_CODES = {
  emptyInput: 'hash.empty_input',
  unsupportedAlgorithm: 'hash.unsupported_algorithm',
  fileReadFailure: 'hash.file_read_failure',
  largeInput: 'hash.large_input',
  cryptoUnavailable: 'hash.crypto_unavailable',
} as const;

/**
 * Default soft size threshold for hashing input, in bytes. Same 10 MB
 * value + per-registration override knob as the other lenses.
 * Informational only; nothing is blocked above it.
 */
export const DEFAULT_LARGE_INPUT_BYTES = 10 * 1024 * 1024;
