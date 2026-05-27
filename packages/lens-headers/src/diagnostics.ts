import type { Diagnostic } from '@nekotools/contracts';

/** Diagnostic helper honoring `exactOptionalPropertyTypes`. */
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
 * Canonical NekoHeaders diagnostic codes (engine MVP).
 *
 *   - headers.empty_input      (info)    — no headers parsed.
 *   - headers.malformed_line   (error)   — a non-blank line with no `:` (and not a request/status line), or an empty name.
 *   - headers.duplicate_header (warning) — the same header name appears more than once.
 *   - headers.security_hint    (info)    — a recommended security response header is absent (basic, free).
 *   - headers.large_document   (info)    — input exceeds the soft byte threshold.
 */
export const HEADERS_DIAGNOSTIC_CODES = {
  emptyInput: 'headers.empty_input',
  malformedLine: 'headers.malformed_line',
  duplicateHeader: 'headers.duplicate_header',
  securityHint: 'headers.security_hint',
  largeDocument: 'headers.large_document',
} as const;

/** Soft size threshold (UTF-8 bytes); informational only. */
export const DEFAULT_LARGE_DOCUMENT_BYTES = 10 * 1024 * 1024;

export interface SecurityHint {
  /** Lowercased header name to look for. */
  readonly header: string;
  readonly message: string;
}

/**
 * Basic (free) security hints: common response headers whose absence is
 * worth flagging. Informational. Deep auditing, CORS/CSP policy packs, and
 * profile comparison are Pro.
 */
export const SECURITY_HINTS: readonly SecurityHint[] = [
  { header: 'strict-transport-security', message: 'Strict-Transport-Security (HSTS) header is absent' },
  { header: 'content-security-policy', message: 'Content-Security-Policy header is absent' },
  {
    header: 'x-content-type-options',
    message: 'X-Content-Type-Options header is absent (recommended: nosniff)',
  },
  { header: 'x-frame-options', message: 'X-Frame-Options header is absent' },
  { header: 'referrer-policy', message: 'Referrer-Policy header is absent' },
];
