/**
 * Deterministic, monotonic-ish id generator. We do not use a random or
 * time-based id at module scope because it makes tests fragile and
 * exports non-reproducible across runs. Each parse/export call gets a
 * fresh counter via makeIdFactory().
 */
export function makeIdFactory(prefix: string): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}_${n}`;
  };
}

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

/**
 * A frozen timestamp passed in by the caller (the runtime). We deliberately
 * do not call new Date() inside parsers — that makes outputs change between
 * runs and breaks reproducible exports.
 */
export interface Clock {
  now(): string;
}

export const FIXED_CLOCK = (iso: string): Clock => ({ now: () => iso });
