import type { Diagnostic } from '@nekotools/contracts';
import { makeIdFactory } from '@nekotools/lens-kit';

import { URL_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';

/**
 * NekoURL encode/decode utilities. Pure functions over the native
 * `encodeURIComponent` / `decodeURIComponent` / `URLSearchParams` — no
 * network, no external dependency. The UI calls these directly for its
 * encode/decode panel; they are also exported for engine consumers.
 */

export interface DecodeResult {
  readonly ok: boolean;
  /** Decoded text on success; the original input echoed back on failure. */
  readonly value: string;
  readonly diagnostics: readonly Diagnostic[];
}

/** Percent-encode a single component with `encodeURIComponent`. Never fails. */
export function encodeComponent(raw: string): string {
  return encodeURIComponent(raw);
}

/**
 * Percent-decode a single component with `decodeURIComponent`, but never
 * throw: a malformed escape (a stray `%`, an incomplete `%E0`, etc.)
 * produces a `url.decode_error` diagnostic instead of a `URIError`, and
 * the original input is echoed back unchanged.
 */
export function decodeComponent(raw: string): DecodeResult {
  const diagIds = makeIdFactory('diag');
  try {
    return { ok: true, value: decodeURIComponent(raw), diagnostics: [] };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      value: raw,
      diagnostics: [
        makeDiagnostic(
          diagIds(),
          'error',
          URL_DIAGNOSTIC_CODES.decodeError,
          `cannot percent-decode input: ${detail}`,
          undefined,
          'check for a stray "%" or an incomplete escape such as "%E0%A4".',
        ),
      ],
    };
  }
}

/**
 * Normalize a query string by sorting its parameters by key (stable for
 * equal keys) and re-serializing with `URLSearchParams`. Accepts the
 * search string with or without a leading `?`. The output is
 * `application/x-www-form-urlencoded`, which is a deterministic
 * canonical form suitable for comparison.
 */
export function normalizeQuery(search: string): string {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  params.sort();
  return params.toString();
}
