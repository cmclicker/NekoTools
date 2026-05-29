/**
 * Tiny, dependency-free encoding helpers. These are local to lens-hash
 * (the lens-kit extraction rule only moves a helper once it has been
 * duplicated past three tools; hex/base64 here are the first use).
 *
 * All run identically in the browser and in Node >= 20: `TextEncoder` and
 * `btoa` are globals in both. Digests are tiny (<= 64 bytes), so the
 * per-byte string building here is never a hot path.
 */

const SHARED_UTF8_ENCODER = new TextEncoder();

export function utf8Encode(value: string): Uint8Array {
  return SHARED_UTF8_ENCODER.encode(value);
}

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

/** Lowercase hex encoding of a byte array. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

/** Standard base64 encoding of a byte array (via the global `btoa`). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}
