/**
 * Self-contained Unicode codepoint inspector: break a string into code
 * points and describe each (hex, decimal, UTF-8 / UTF-16 bytes, general
 * category, escape forms). No deps, no network, no Unicode name database.
 */

const UTF8 = new TextEncoder();

export type GeneralCategory =
  | 'letter'
  | 'number'
  | 'punctuation'
  | 'separator'
  | 'symbol'
  | 'mark'
  | 'control'
  | 'other';

export interface CodepointInfo {
  /** The character itself (may be a multi-unit grapheme for astral code points). */
  readonly char: string;
  /** The Unicode scalar value. */
  readonly codepoint: number;
  /** `U+XXXX` notation. */
  readonly hex: string;
  /** Decimal value. */
  readonly decimal: number;
  /** UTF-8 bytes as space-separated hex. */
  readonly utf8: string;
  /** UTF-16 code units as space-separated hex. */
  readonly utf16: string;
  readonly category: GeneralCategory;
  /** `\u{XXXX}` JS escape. */
  readonly jsEscape: string;
  /** `&#DEC;` HTML numeric entity. */
  readonly htmlEntity: string;
  /** Percent-encoding of the character's UTF-8 bytes. */
  readonly urlEncoded: string;
  /** True for C0/C1 control characters. */
  readonly isControl: boolean;
}

function pad4(n: number): string {
  const h = n.toString(16).toUpperCase();
  return h.length < 4 ? h.padStart(4, '0') : h;
}

function categoryOf(ch: string): GeneralCategory {
  if (/\p{L}/u.test(ch)) return 'letter';
  if (/\p{N}/u.test(ch)) return 'number';
  if (/\p{P}/u.test(ch)) return 'punctuation';
  if (/\p{Z}/u.test(ch)) return 'separator';
  if (/\p{S}/u.test(ch)) return 'symbol';
  if (/\p{M}/u.test(ch)) return 'mark';
  if (/\p{C}/u.test(ch)) return 'control';
  return 'other';
}

export function describeCodepoint(codepoint: number): CodepointInfo {
  const char = String.fromCodePoint(codepoint);
  const utf8 = [...UTF8.encode(char)].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  const utf16 = [...char].length === 0 ? '' : codeUnits(char).map((u) => u.toString(16).toUpperCase().padStart(4, '0')).join(' ');
  return {
    char,
    codepoint,
    hex: `U+${pad4(codepoint)}`,
    decimal: codepoint,
    utf8,
    utf16,
    category: categoryOf(char),
    jsEscape: `\\u{${codepoint.toString(16).toUpperCase()}}`,
    htmlEntity: `&#${codepoint};`,
    urlEncoded: encodeURIComponent(char),
    isControl: (codepoint >= 0x00 && codepoint <= 0x1f) || (codepoint >= 0x7f && codepoint <= 0x9f),
  };
}

function codeUnits(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  return out;
}

export interface UnicodeScan {
  readonly codepointCount: number;
  readonly utf16UnitCount: number;
  readonly byteLength: number;
  readonly codepoints: readonly CodepointInfo[];
  readonly truncated: boolean;
}

/** Break a string into code points; `limit` caps the per-codepoint detail list. */
export function scanUnicode(input: string, limit = 500): UnicodeScan {
  const codepoints: CodepointInfo[] = [];
  let count = 0;
  let truncated = false;
  for (const ch of input) {
    count += 1;
    if (codepoints.length < limit) codepoints.push(describeCodepoint(ch.codePointAt(0)!));
    else truncated = true;
  }
  return {
    codepointCount: count,
    utf16UnitCount: input.length,
    byteLength: UTF8.encode(input).byteLength,
    codepoints,
    truncated,
  };
}
