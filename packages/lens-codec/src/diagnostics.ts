import type { Diagnostic } from '@nekotools/contracts';

import type { CodecErrorCode } from './codecs.js';

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
 * Canonical NekoCodec diagnostic codes (engine MVP).
 *
 *   - codec.empty_input             (info)    — input is empty.
 *   - codec.invalid_base64          (error)   — decode target is not Base64.
 *   - codec.invalid_base64url       (error)   — decode target is not Base64URL.
 *   - codec.invalid_hex             (error)   — decode target is not hex.
 *   - codec.invalid_percent_encoding(error)   — decode target has bad %-escapes.
 *   - codec.binary_output           (warning) — decode produced binary-looking bytes.
 *   - codec.large_document          (info)    — input exceeds the soft byte threshold.
 *
 * Adding a code requires updating this object and the conformance tests in
 * the same PR.
 */
export const CODEC_DIAGNOSTIC_CODES = {
  emptyInput: 'codec.empty_input',
  invalidBase64: 'codec.invalid_base64',
  invalidBase64Url: 'codec.invalid_base64url',
  invalidHex: 'codec.invalid_hex',
  invalidPercentEncoding: 'codec.invalid_percent_encoding',
  binaryOutput: 'codec.binary_output',
  largeDocument: 'codec.large_document',
} as const;

/**
 * Default soft size threshold for codec input, in UTF-8 bytes. Same 10 MB
 * value + per-registration override knob as the other lenses.
 * Informational only; nothing is blocked above it.
 */
export const DEFAULT_LARGE_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Map a decode `CodecErrorCode` to its NekoCodec diagnostic code. */
export function errorCodeToDiagnostic(code: CodecErrorCode): string {
  switch (code) {
    case 'invalid_base64':
      return CODEC_DIAGNOSTIC_CODES.invalidBase64;
    case 'invalid_base64url':
      return CODEC_DIAGNOSTIC_CODES.invalidBase64Url;
    case 'invalid_hex':
      return CODEC_DIAGNOSTIC_CODES.invalidHex;
    case 'invalid_percent_encoding':
      return CODEC_DIAGNOSTIC_CODES.invalidPercentEncoding;
  }
}
