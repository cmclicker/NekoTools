import type { Diagnostic } from '@nekotools/contracts';

/**
 * Helper that produces a Diagnostic while honoring
 * `exactOptionalPropertyTypes`. Mirrors the other lenses' helper.
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
 * Canonical NekoCookies diagnostic codes (engine MVP). The set is
 * deliberately security/privacy-forward — that is the product wedge.
 *
 *   - cookie.empty_input            (info)    — empty / whitespace-only input.
 *   - cookie.parse_error            (error)   — a line has no `name=value` pair.
 *   - cookie.insecure               (warning) — Set-Cookie without `Secure`.
 *   - cookie.no_httponly            (warning) — Set-Cookie without `HttpOnly` (JS-readable).
 *   - cookie.samesite_missing       (info)    — no `SameSite` (browser default applies).
 *   - cookie.samesite_none_insecure (warning) — `SameSite=None` without `Secure` (rejected).
 *   - cookie.secure_prefix          (warning) — `__Secure-` name without `Secure`.
 *   - cookie.host_prefix            (warning) — `__Host-` name violating its rules.
 *   - cookie.expired                (info)    — `Expires` in the past or `Max-Age<=0`.
 *   - cookie.duplicate_name         (warning) — the same cookie name appears twice.
 *   - cookie.large                  (info)    — cookie exceeds the ~4096-byte soft limit.
 *
 * Adding a code requires updating this object and the conformance tests.
 */
export const COOKIE_DIAGNOSTIC_CODES = {
  emptyInput: 'cookie.empty_input',
  parseError: 'cookie.parse_error',
  insecure: 'cookie.insecure',
  noHttpOnly: 'cookie.no_httponly',
  sameSiteMissing: 'cookie.samesite_missing',
  sameSiteNoneInsecure: 'cookie.samesite_none_insecure',
  securePrefix: 'cookie.secure_prefix',
  hostPrefix: 'cookie.host_prefix',
  expired: 'cookie.expired',
  duplicateName: 'cookie.duplicate_name',
  large: 'cookie.large',
} as const;

/** RFC 6265 soft limit: 4096 bytes per cookie (name + value + attributes). */
export const DEFAULT_LARGE_COOKIE_BYTES = 4096;
