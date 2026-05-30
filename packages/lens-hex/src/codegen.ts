import { decodeHex } from './hex.js';
import type { HexReport } from './kinds.js';

/**
 * NekoHex Pro generators. Back the declared Pro exporters
 * `hex.export.c-array` (pro entitlement `export.c-array`) and
 * `hex.export.base64` (pro entitlement `export.base64`).
 *
 * Both are pure, deterministic functions of the parsed `hex.parsed` bytes
 * (recovered from the report's continuous hex string via the canonical
 * `decodeHex`) — no network, no clock, no premium engine. The byte-diff /
 * byte-edit / pattern-search / struct-decode Pro features stay
 * advertising-only (they need an interactive editor engine, per the
 * manifest's out-of-scope list).
 */

/** Recover the parsed bytes from a report's continuous hex string. */
function bytesOf(report: HexReport): Uint8Array {
  return decodeHex(report.hex).bytes;
}

// --- c-array ---------------------------------------------------------------

/**
 * `hex.export.c-array` — the bytes as a C `unsigned char` array literal:
 * `0xNN` values, 12 per line, plus a `_len` size constant. A ready-to-paste
 * embedding of the input as a byte blob.
 */
export function toCArray(report: HexReport, name = 'data'): string {
  const bytes = bytesOf(report);
  const lines: string[] = [`unsigned char ${name}[] = {`];
  if (bytes.length === 0) {
    lines.push('};');
    lines.push(`unsigned int ${name}_len = 0;`);
    return lines.join('\n');
  }
  const perLine = 12;
  for (let i = 0; i < bytes.length; i += perLine) {
    const chunk = Array.from(bytes.slice(i, i + perLine), (b) => `0x${b.toString(16).padStart(2, '0')}`);
    const trailing = i + perLine < bytes.length ? ',' : '';
    lines.push(`  ${chunk.join(', ')}${trailing}`);
  }
  lines.push('};');
  lines.push(`unsigned int ${name}_len = ${bytes.length};`);
  return lines.join('\n');
}

// --- base64 ----------------------------------------------------------------

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * `hex.export.base64` — the bytes as a standard (RFC 4648) base64 string with
 * `=` padding. Pure local encoder (no `btoa` / `Buffer` dependency), so it
 * runs identically in any runtime and stays offline.
 */
export function toBase64(report: HexReport): string {
  const bytes = bytesOf(report);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    out += B64_ALPHABET[(triple >> 18) & 0x3f];
    out += B64_ALPHABET[(triple >> 12) & 0x3f];
    out += hasB1 ? B64_ALPHABET[(triple >> 6) & 0x3f] : '=';
    out += hasB2 ? B64_ALPHABET[triple & 0x3f] : '=';
  }
  return out;
}
