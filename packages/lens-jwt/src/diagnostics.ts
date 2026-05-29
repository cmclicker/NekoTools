import type { Diagnostic } from '@nekotools/contracts';

/**
 * Helper that produces a Diagnostic while honoring
 * `exactOptionalPropertyTypes` (no `key: undefined`).
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
 * Canonical NekoJWT diagnostic codes (Free MVP).
 *
 *   - jwt.empty_input            (info)    — zero-length or whitespace-only input.
 *   - jwt.malformed_structure    (error)   — input doesn't split into 3 segments.
 *   - jwt.invalid_segment_count  (error)   — wrong number of segments (not 3).
 *   - jwt.invalid_base64url_*    (error)   — one of header/payload/signature is not valid Base64URL.
 *   - jwt.invalid_header_json    (error)   — header segment doesn't decode to valid JSON.
 *   - jwt.invalid_payload_json   (error)   — payload segment doesn't decode to valid JSON.
 *   - jwt.token_expired          (warning) — exp claim is in the past.
 *   - jwt.token_not_yet_valid    (warning) — nbf claim is in the future.
 *   - jwt.missing_expiration     (warning) — no exp claim present.
 *   - jwt.alg_none               (error)   — alg = "none" (security risk).
 *   - jwt.signature_not_verified (info)    — signature decoded but not verified (always emitted for valid tokens).
 *   - jwt.large_document         (info)    — input exceeds soft byte threshold.
 */
export const JWT_DIAGNOSTIC_CODES = {
  emptyInput: 'jwt.empty_input',
  malformedStructure: 'jwt.malformed_structure',
  invalidSegmentCount: 'jwt.invalid_segment_count',
  invalidBase64urlHeader: 'jwt.invalid_base64url_header',
  invalidBase64urlPayload: 'jwt.invalid_base64url_payload',
  invalidBase64urlSignature: 'jwt.invalid_base64url_signature',
  invalidHeaderJson: 'jwt.invalid_header_json',
  invalidPayloadJson: 'jwt.invalid_payload_json',
  tokenExpired: 'jwt.token_expired',
  tokenNotYetValid: 'jwt.token_not_yet_valid',
  missingExpiration: 'jwt.missing_expiration',
  algNone: 'jwt.alg_none',
  signatureNotVerified: 'jwt.signature_not_verified',
  signatureVerified: 'jwt.signature_verified',
  signatureInvalid: 'jwt.signature_invalid',
  signatureUnverifiable: 'jwt.signature_unverifiable',
  largeDocument: 'jwt.large_document',
} as const;

/**
 * Default soft size threshold for `jwt.text` input, in UTF-8 bytes.
 * Same 10 MB value + per-registration override knob as the other lenses.
 * Informational only; nothing is blocked above it.
 */
export const DEFAULT_LARGE_DOCUMENT_BYTES = 10 * 1024 * 1024;
