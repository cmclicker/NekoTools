import type { BinaryArtifact } from './kinds.js';
import { hexToBytes } from './util.js';

/**
 * NekoBinary Pro code generation. Backs the declared Pro exporters
 * `binary.export.byte-map` (pro entitlements `export.byte-map` /
 * `inspect.byte-map`) and `binary.export.batch.report` (pro entitlement
 * `export.batch.report`).
 *
 * Both are pure, deterministic functions of the already-parsed NekoBinary
 * artifacts — no network, no clock, no premium-engine dependency. NekoBinary
 * is the conformance lens: it parses one value via five parsers
 * (decimal/binary/hex/base64/utf8) into one of three artifact kinds. These
 * generators recover the decoded bytes from each artifact and render them, so
 * they never re-parse the raw input — they operate on what the parsers already
 * produced.
 */

const UTF8 = new TextEncoder();

/** A human label for the decoded artifact's representation/source kind. */
export type BinaryRepresentation = 'integer' | 'bytes' | 'text';

/**
 * The decoded bytes of one parsed artifact plus how it was represented.
 *
 *  - `binary.number` → the integer's minimal big-endian bytes (a lone `0x00`
 *    for zero; the low 53 bits for a non-safe integer, which the parser has
 *    already flagged with `binary.unsafe_integer`).
 *  - `binary.bytes`  → the bytes the parser stored as a lowercase hex string.
 *  - `binary.text`   → the UTF-8 encoding of the preserved string.
 */
export interface DecodedArtifact {
  readonly representation: BinaryRepresentation;
  readonly bytes: Uint8Array;
}

/** Minimal big-endian byte encoding of a non-negative integer (0 → [0x00]). */
function integerToBytes(value: number): Uint8Array {
  const n = Math.trunc(value);
  if (n <= 0) return new Uint8Array([0]);
  const out: number[] = [];
  let rest = n;
  while (rest > 0) {
    out.unshift(rest % 256);
    rest = Math.floor(rest / 256);
  }
  return new Uint8Array(out);
}

/** Recover the decoded bytes + representation of one parsed artifact. */
export function decodeArtifact(artifact: BinaryArtifact): DecodedArtifact {
  switch (artifact.kind) {
    case 'binary.number':
      return { representation: 'integer', bytes: integerToBytes(artifact.value) };
    case 'binary.bytes':
      return { representation: 'bytes', bytes: hexToBytes(artifact.value) };
    case 'binary.text':
      return { representation: 'text', bytes: UTF8.encode(artifact.value) };
  }
}

// --- Byte map --------------------------------------------------------------

const HEX = '0123456789abcdef';

function hex2(byte: number): string {
  return HEX.charAt((byte >> 4) & 0xf) + HEX.charAt(byte & 0xf);
}

/**
 * The printable-ASCII glyph for a byte, or `.` for control/non-ASCII. The
 * markdown-table-breaking characters `|` and `\` are escaped so an arbitrary
 * byte can never corrupt the byte-map table.
 */
function asciiGlyph(byte: number): string {
  if (byte < 0x20 || byte > 0x7e) return '.';
  const ch = String.fromCharCode(byte);
  if (ch === '|') return '\\|';
  if (ch === '\\') return '\\\\';
  return ch;
}

/**
 * Render a byte map of the decoded bytes as a markdown table with
 * offset / hex / decimal / binary / ascii columns — a richer hexdump derived
 * purely from the parsed bytes. Offsets are zero-padded hex; the table is
 * stable for a given byte sequence.
 */
export function toByteMap(artifact: BinaryArtifact): string {
  const { representation, bytes } = decodeArtifact(artifact);
  const lines: string[] = [
    '# NekoBinary byte map',
    '',
    `- representation: ${representation}`,
    `- bytes: ${bytes.length}`,
    '',
    '| offset | hex | decimal | binary | ascii |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i]!;
    const offset = `0x${i.toString(16).padStart(4, '0')}`;
    lines.push(
      `| ${offset} | ${hex2(b)} | ${b} | ${b.toString(2).padStart(8, '0')} | ${asciiGlyph(b)} |`,
    );
  }
  return lines.join('\n');
}

// --- Batch report ----------------------------------------------------------

/** Render the decoded bytes of one artifact as a continuous hex string. */
function bytesHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += hex2(b);
  return out;
}

/** Standard base64 of the decoded bytes (built byte-by-byte, no spread). */
function bytesBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Render a batch report over every parsed artifact in the input list: for each
 * one, its detected input representation, byte length, and a per-artifact
 * summary (value in binary / decimal / hex / base64, plus a byte-sum). "Batch"
 * means the whole artifact list is covered — today usually one, but the report
 * is written for the list. Pure and deterministic.
 */
export function toBatchReport(artifacts: readonly BinaryArtifact[]): string {
  const lines: string[] = [
    '# NekoBinary batch report',
    '',
    `- artifacts: ${artifacts.length}`,
    '',
  ];

  if (artifacts.length === 0) {
    lines.push('_no artifacts to report_');
    return lines.join('\n');
  }

  let index = 0;
  for (const artifact of artifacts) {
    const { representation, bytes } = decodeArtifact(artifact);
    const total = bytes.reduce((sum, b) => sum + b, 0);
    const binary = Array.from(bytes, (b) => b.toString(2).padStart(8, '0')).join(' ');
    const decimal = Array.from(bytes).join(' ');
    const hex = bytesHex(bytes);
    const base64 = bytesBase64(bytes);

    lines.push(
      `## ${index + 1}. ${artifact.kind} \`${artifact.id}\``,
      '',
      `- representation: ${representation}`,
      `- bytes: ${bytes.length}`,
      `- byte sum: ${total}`,
      `- binary: ${binary}`,
      `- decimal: ${decimal}`,
      `- hex: ${hex}`,
      `- base64: ${base64}`,
      '',
    );
    index += 1;
  }

  return lines.join('\n').trimEnd() + '\n';
}
