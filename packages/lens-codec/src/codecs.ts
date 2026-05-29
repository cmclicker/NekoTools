/**
 * NekoCodec pure transform core.
 *
 * Dependency-free and environment-agnostic: every transform runs on
 * `TextEncoder` / `TextDecoder` plus a hand-rolled Base64 / Hex codec, so
 * the exact same code path executes in Node and in the browser. We
 * deliberately do NOT use `btoa` / `atob` (they are Latin-1 only and throw
 * on multi-byte text) and we pull in no third-party package. Nothing here
 * touches the network.
 *
 * Encoders take a string and always succeed (UTF-8 is total). Decoders
 * validate their input and return a discriminated result, so a malformed
 * token becomes a diagnostic rather than a thrown exception — the parser
 * that calls this core never throws.
 */

export type CodecName = 'base64' | 'base64url' | 'url' | 'hex';
export type CodecOperation = 'encode' | 'decode';

export type CodecErrorCode =
  | 'invalid_base64'
  | 'invalid_base64url'
  | 'invalid_hex'
  | 'invalid_percent_encoding';

/** Result of a decode transform. */
export type DecodeResult =
  | { readonly ok: true; readonly value: string; readonly looksBinary: boolean }
  | { readonly ok: false; readonly code: CodecErrorCode; readonly message: string };

/** Flat outcome the parser consumes for either operation. */
export interface TransformOutcome {
  readonly ok: boolean;
  readonly output: string | null;
  readonly looksBinary: boolean;
  readonly errorCode: CodecErrorCode | null;
  readonly errorMessage: string | null;
}

export function isCodecName(value: unknown): value is CodecName {
  return value === 'base64' || value === 'base64url' || value === 'url' || value === 'hex';
}

export function isCodecOperation(value: unknown): value is CodecOperation {
  return value === 'encode' || value === 'decode';
}

const ENCODER = new TextEncoder();
// `fatal: false` so invalid byte sequences decode to U+FFFD rather than
// throwing — decoding never throws; `looksBinary` flags suspicious output.
const DECODER = new TextDecoder('utf-8', { fatal: false });

function utf8Bytes(text: string): Uint8Array {
  return ENCODER.encode(text);
}

function bytesToUtf8(bytes: Uint8Array): string {
  return DECODER.decode(bytes);
}

const STD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function buildLookup(alphabet: string): Int16Array {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < alphabet.length; i += 1) {
    table[alphabet.charCodeAt(i)] = i;
  }
  return table;
}

// base64url input is normalized to the standard alphabet before lookup, so
// a single standard table decodes both variants.
const STD_LOOKUP = buildLookup(STD_ALPHABET);

function bytesToBase64(bytes: Uint8Array, urlSafe: boolean): string {
  const alphabet = urlSafe ? URL_ALPHABET : STD_ALPHABET;
  const pad = urlSafe ? '' : '=';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1]! : 0;
    const b2 = hasB2 ? bytes[i + 2]! : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += alphabet[(triple >> 18) & 0x3f]!;
    out += alphabet[(triple >> 12) & 0x3f]!;
    out += hasB1 ? alphabet[(triple >> 6) & 0x3f]! : pad;
    out += hasB2 ? alphabet[triple & 0x3f]! : pad;
  }
  return out;
}

function base64ToBytes(input: string, urlSafe: boolean): Uint8Array | null {
  // Whitespace (pasted line breaks) is ignored; everything else must be
  // alphabet + optional trailing padding.
  let s = input.replace(/\s+/g, '');
  if (urlSafe) s = s.replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
  const noPad = s.replace(/=+$/, '');
  // A single leftover sextet cannot form a byte — the token is truncated.
  if (noPad.length % 4 === 1) return null;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < noPad.length; i += 1) {
    const value = STD_LOOKUP[noPad.charCodeAt(i)] ?? -1;
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

const HEX_DIGITS = '0123456789abcdef';

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i]!;
    out += HEX_DIGITS[(b >> 4) & 0x0f]! + HEX_DIGITS[b & 0x0f]!;
  }
  return out;
}

function hexToBytes(input: string): Uint8Array | null {
  const s = input.replace(/\s+/g, '');
  if (s.length === 0) return new Uint8Array(0);
  if (s.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(s)) return null;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(s.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Heuristic: does this byte run look like binary rather than text? A NUL
 * byte is treated as decisive; otherwise a high ratio of C0 control bytes
 * (excluding tab / LF / CR) flags the output. Used to warn that a decode
 * produced bytes that are being shown as best-effort text.
 */
function looksBinary(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  let suspicious = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i]!;
    if (b === 0) return true;
    if (b < 0x09 || (b > 0x0d && b < 0x20)) suspicious += 1;
  }
  return suspicious / bytes.length > 0.1;
}

/** Encode UTF-8 text into the named codec. Total — never fails. */
export function encodeText(codec: CodecName, text: string): string {
  switch (codec) {
    case 'base64':
      return bytesToBase64(utf8Bytes(text), false);
    case 'base64url':
      return bytesToBase64(utf8Bytes(text), true);
    case 'url':
      return encodeURIComponent(text);
    case 'hex':
      return bytesToHex(utf8Bytes(text));
  }
}

/** Decode the named codec back to UTF-8 text, or report why it can't. */
export function decodeText(codec: CodecName, text: string): DecodeResult {
  switch (codec) {
    case 'base64': {
      const bytes = base64ToBytes(text, false);
      if (bytes === null) {
        return { ok: false, code: 'invalid_base64', message: 'input is not valid Base64' };
      }
      return { ok: true, value: bytesToUtf8(bytes), looksBinary: looksBinary(bytes) };
    }
    case 'base64url': {
      const bytes = base64ToBytes(text, true);
      if (bytes === null) {
        return { ok: false, code: 'invalid_base64url', message: 'input is not valid Base64URL' };
      }
      return { ok: true, value: bytesToUtf8(bytes), looksBinary: looksBinary(bytes) };
    }
    case 'url': {
      try {
        return { ok: true, value: decodeURIComponent(text), looksBinary: false };
      } catch {
        return {
          ok: false,
          code: 'invalid_percent_encoding',
          message: 'input contains invalid percent-encoding',
        };
      }
    }
    case 'hex': {
      const bytes = hexToBytes(text);
      if (bytes === null) {
        return { ok: false, code: 'invalid_hex', message: 'input is not valid hexadecimal' };
      }
      return { ok: true, value: bytesToUtf8(bytes), looksBinary: looksBinary(bytes) };
    }
  }
}

/** Dispatch a single transform into the flat outcome the parser consumes. */
export function runTransform(
  operation: CodecOperation,
  codec: CodecName,
  input: string,
): TransformOutcome {
  if (operation === 'encode') {
    return {
      ok: true,
      output: encodeText(codec, input),
      looksBinary: false,
      errorCode: null,
      errorMessage: null,
    };
  }
  const result = decodeText(codec, input);
  if (result.ok) {
    return {
      ok: true,
      output: result.value,
      looksBinary: result.looksBinary,
      errorCode: null,
      errorMessage: null,
    };
  }
  return {
    ok: false,
    output: null,
    looksBinary: false,
    errorCode: result.code,
    errorMessage: result.message,
  };
}
