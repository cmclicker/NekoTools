/**
 * Binary-specific byte/hex helpers.
 *
 * The `Clock` / `FIXED_CLOCK` / `makeIdFactory` trio that used to live
 * here moved to `@nekotools/lens-kit` once it crossed the "duplicated
 * more than twice across tools" threshold from NekoJSON's charter §7.
 * These hex helpers stay because they are not shared with other lenses.
 * `Clock`, `FIXED_CLOCK`, and `makeIdFactory` are now re-exported from
 * this module (via lens-kit) so existing `./util.js` imports keep
 * working.
 */
export { type Clock, FIXED_CLOCK, makeIdFactory } from '@nekotools/lens-kit';

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2 !== 0) {
    throw new Error('hex string has odd length');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const byte = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(`invalid hex byte at offset ${i * 2}`);
    }
    out[i] = byte;
  }
  return out;
}
