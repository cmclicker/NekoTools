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
 * Canonical NekoURL diagnostic codes (engine MVP).
 *
 *   - url.empty_input         (info)    — empty / whitespace-only input.
 *   - url.parse_error         (error)   — input is not a parseable absolute URL.
 *   - url.relative_url        (warning) — input is relative; NekoURL needs an
 *                                         absolute URL (it never assumes a base).
 *   - url.credentials_present (warning) — userinfo (user:pass) embedded in the URL.
 *   - url.insecure_scheme     (warning) — a cleartext network scheme (http/ws/ftp).
 *   - url.long_query          (info)    — query string exceeds the soft threshold.
 *   - url.duplicate_query_key (warning) — a query key appears more than once.
 *   - url.decode_error        (error)   — decodeURIComponent could not decode the input.
 *
 * Adding a code requires updating this object and the conformance tests
 * in the same PR.
 */
export const URL_DIAGNOSTIC_CODES = {
  emptyInput: 'url.empty_input',
  parseError: 'url.parse_error',
  relativeUrl: 'url.relative_url',
  credentialsPresent: 'url.credentials_present',
  insecureScheme: 'url.insecure_scheme',
  longQuery: 'url.long_query',
  duplicateQueryKey: 'url.duplicate_query_key',
  decodeError: 'url.decode_error',
} as const;

/**
 * Default soft threshold (UTF-8 bytes) for the URL search string before
 * `url.long_query` is emitted. Informational only; nothing is blocked
 * above it. Overridable per-registration, like the lens-yaml large-doc knob.
 */
export const DEFAULT_LONG_QUERY_BYTES = 512;

/**
 * Cleartext network schemes that have a secure sibling. NekoURL flags
 * these (and only these) for `url.insecure_scheme` — a generic
 * "not https" check would wrongly warn on `mailto:`, `file:`, `data:`,
 * `tel:`, etc., which have no transport to secure.
 */
export const INSECURE_SCHEME_UPGRADES: Readonly<Record<string, string>> = {
  http: 'https',
  ws: 'wss',
  ftp: 'ftps',
};
