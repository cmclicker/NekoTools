/**
 * Self-contained hex-dump core: turn bytes into a classic offset / hex /
 * ASCII dump, and decode a hex string back to bytes. No deps, no network.
 */

const UTF8 = new TextEncoder();

export interface DumpRow {
  /** 8-digit hex offset of the row's first byte. */
  readonly offset: string;
  /** Up to 16 bytes as 2-digit hex, space-separated (padded to width). */
  readonly hex: string;
  /** ASCII gutter; non-printable bytes shown as ".". */
  readonly ascii: string;
}

export const BYTES_PER_ROW = 16;

function toHexByte(b: number): string {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

/** UTF-8 encode a string to bytes. */
export function textToBytes(text: string): Uint8Array {
  return UTF8.encode(text);
}

export interface HexDecode {
  readonly ok: boolean;
  readonly bytes: Uint8Array;
  /** Set when decoding failed: 'odd' (odd length) or 'invalid' (non-hex char). */
  readonly error: 'odd' | 'invalid' | null;
}

/** Decode a hex string (whitespace and an optional 0x prefix are ignored). */
export function decodeHex(input: string): HexDecode {
  const cleaned = input.replace(/0x/gi, '').replace(/[\s:,_-]+/g, '');
  if (cleaned === '') return { ok: true, bytes: new Uint8Array(0), error: null };
  if (!/^[0-9a-fA-F]*$/.test(cleaned)) return { ok: false, bytes: new Uint8Array(0), error: 'invalid' };
  if (cleaned.length % 2 !== 0) return { ok: false, bytes: new Uint8Array(0), error: 'odd' };
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  return { ok: true, bytes, error: null };
}

/** Continuous uppercase hex string for the given bytes. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += toHexByte(b);
  return out;
}

/** Build the offset/hex/ASCII dump rows for the given bytes. */
export function dumpRows(bytes: Uint8Array): DumpRow[] {
  const rows: DumpRow[] = [];
  for (let off = 0; off < bytes.length; off += BYTES_PER_ROW) {
    const slice = bytes.subarray(off, off + BYTES_PER_ROW);
    const hexParts: string[] = [];
    let ascii = '';
    for (let i = 0; i < BYTES_PER_ROW; i++) {
      if (i < slice.length) {
        const b = slice[i]!;
        hexParts.push(toHexByte(b));
        ascii += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.';
      } else {
        hexParts.push('  ');
      }
    }
    // Group into two 8-byte halves for readability.
    const hex = `${hexParts.slice(0, 8).join(' ')}  ${hexParts.slice(8).join(' ')}`;
    rows.push({ offset: off.toString(16).toUpperCase().padStart(8, '0'), hex, ascii });
  }
  return rows;
}

/** Render dump rows as a single text block. */
export function dumpText(rows: readonly DumpRow[]): string {
  return rows.map((r) => `${r.offset}  ${r.hex}  |${r.ascii}|`).join('\n');
}
