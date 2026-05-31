/**
 * Code-point naming for NekoUnicode's Pro exporters — WITHOUT the full UCD.
 *
 * The thesis forbids a runtime fetch and forbids bundling the (multi-megabyte)
 * Unicode Character Database, but it does NOT forbid shipping a small static
 * table. So this module derives a name from two layers, in order:
 *
 *   1. ALGORITHMIC names for ranges with stable, well-defined formal names:
 *        - C0 controls           U+0000..U+001F  (NUL, SOH, ..., US)
 *        - DELETE                 U+007F
 *        - C1 controls            U+0080..U+009F  (PAD, ..., APC)
 *      These are fixed by the standard and computed from offset tables, so
 *      they are exact, not guesses.
 *
 *   2. A small CURATED map of common / important code points whose names
 *      people actually look up (NO-BREAK SPACE, ZERO WIDTH SPACE, BYTE ORDER
 *      MARK, REPLACEMENT CHARACTER, a handful of well-known symbols/emoji,
 *      etc.). Every entry here is a verbatim Unicode formal name.
 *
 * For everything NOT covered above, we DO NOT invent a name. Instead we emit a
 * principled, clearly-synthetic fallback derived from data we already have
 * (the `U+XXXX` notation + the general category): e.g.
 * `U+4E2D (letter)` or, when no category is supplied, `CODE POINT U+4E2D`.
 * A reader can never mistake that for an authoritative UCD name, and it is
 * never WRONG — it only ever states the code point and its broad category,
 * both of which are computed, not assumed.
 *
 * This is intentionally a curated SUBSET plus an algorithmic fallback — it is
 * NOT the full Unicode Character Database. Pure, offline, deterministic, no
 * dependencies.
 */

/**
 * C0 control names (U+0000..U+001F), in code-point order. These are the
 * standard Unicode-1.0 control names; index = code point.
 */
const C0_CONTROL_NAMES: readonly string[] = [
  'NULL',
  'START OF HEADING',
  'START OF TEXT',
  'END OF TEXT',
  'END OF TRANSMISSION',
  'ENQUIRY',
  'ACKNOWLEDGE',
  'BELL',
  'BACKSPACE',
  'CHARACTER TABULATION',
  'LINE FEED',
  'LINE TABULATION',
  'FORM FEED',
  'CARRIAGE RETURN',
  'SHIFT OUT',
  'SHIFT IN',
  'DATA LINK ESCAPE',
  'DEVICE CONTROL ONE',
  'DEVICE CONTROL TWO',
  'DEVICE CONTROL THREE',
  'DEVICE CONTROL FOUR',
  'NEGATIVE ACKNOWLEDGE',
  'SYNCHRONOUS IDLE',
  'END OF TRANSMISSION BLOCK',
  'CANCEL',
  'END OF MEDIUM',
  'SUBSTITUTE',
  'ESCAPE',
  'INFORMATION SEPARATOR FOUR',
  'INFORMATION SEPARATOR THREE',
  'INFORMATION SEPARATOR TWO',
  'INFORMATION SEPARATOR ONE',
];

/**
 * C1 control names (U+0080..U+009F), in code-point order; index = code point −
 * 0x80. These are the standard Unicode-1.0 control names for the C1 range.
 */
const C1_CONTROL_NAMES: readonly string[] = [
  'PADDING CHARACTER',
  'HIGH OCTET PRESET',
  'BREAK PERMITTED HERE',
  'NO BREAK HERE',
  'INDEX',
  'NEXT LINE',
  'START OF SELECTED AREA',
  'END OF SELECTED AREA',
  'CHARACTER TABULATION SET',
  'CHARACTER TABULATION WITH JUSTIFICATION',
  'LINE TABULATION SET',
  'PARTIAL LINE FORWARD',
  'PARTIAL LINE BACKWARD',
  'REVERSE LINE FEED',
  'SINGLE SHIFT TWO',
  'SINGLE SHIFT THREE',
  'DEVICE CONTROL STRING',
  'PRIVATE USE ONE',
  'PRIVATE USE TWO',
  'SET TRANSMIT STATE',
  'CANCEL CHARACTER',
  'MESSAGE WAITING',
  'START OF GUARDED AREA',
  'END OF GUARDED AREA',
  'START OF STRING',
  'SINGLE GRAPHIC CHARACTER INTRODUCER',
  'SINGLE CHARACTER INTRODUCER',
  'CONTROL SEQUENCE INTRODUCER',
  'STRING TERMINATOR',
  'OPERATING SYSTEM COMMAND',
  'PRIVATE MESSAGE',
  'APPLICATION PROGRAM COMMAND',
];

/**
 * Curated map of common / important code points → verbatim Unicode formal
 * names. Deliberately small: the code points people actually paste in to
 * identify (invisible spaces, joiners, the BOM, the replacement char) plus a
 * representative handful of well-known symbols and emoji. Every value is the
 * exact UCD name. NEVER add a guessed name here.
 */
const CURATED_NAMES: Readonly<Record<number, string>> = {
  0x0020: 'SPACE',
  0x00a0: 'NO-BREAK SPACE',
  0x00ad: 'SOFT HYPHEN',
  0x034f: 'COMBINING GRAPHEME JOINER',
  0x2000: 'EN QUAD',
  0x2001: 'EM QUAD',
  0x2002: 'EN SPACE',
  0x2003: 'EM SPACE',
  0x2009: 'THIN SPACE',
  0x200a: 'HAIR SPACE',
  0x200b: 'ZERO WIDTH SPACE',
  0x200c: 'ZERO WIDTH NON-JOINER',
  0x200d: 'ZERO WIDTH JOINER',
  0x200e: 'LEFT-TO-RIGHT MARK',
  0x200f: 'RIGHT-TO-LEFT MARK',
  0x2010: 'HYPHEN',
  0x2013: 'EN DASH',
  0x2014: 'EM DASH',
  0x2018: 'LEFT SINGLE QUOTATION MARK',
  0x2019: 'RIGHT SINGLE QUOTATION MARK',
  0x201c: 'LEFT DOUBLE QUOTATION MARK',
  0x201d: 'RIGHT DOUBLE QUOTATION MARK',
  0x2026: 'HORIZONTAL ELLIPSIS',
  0x2028: 'LINE SEPARATOR',
  0x2029: 'PARAGRAPH SEPARATOR',
  0x202f: 'NARROW NO-BREAK SPACE',
  0x2060: 'WORD JOINER',
  0x20ac: 'EURO SIGN',
  0x2122: 'TRADE MARK SIGN',
  0x3000: 'IDEOGRAPHIC SPACE',
  0xfeff: 'ZERO WIDTH NO-BREAK SPACE',
  0xfffd: 'REPLACEMENT CHARACTER',
  0x1f600: 'GRINNING FACE',
  0x1f44d: 'THUMBS UP SIGN',
  0x1f4a9: 'PILE OF POO',
  0x1f680: 'ROCKET',
};

/** `U+XXXX` notation, matching CodepointInfo.hex (≥4 hex digits, upper-case). */
function toHex(codepoint: number): string {
  const h = codepoint.toString(16).toUpperCase();
  return `U+${h.length < 4 ? h.padStart(4, '0') : h}`;
}

/**
 * An exact, standard formal name for a code point IF we can derive one without
 * the full UCD: the C0 controls, DELETE, the C1 controls, and the curated map.
 * Returns `undefined` for everything else (the caller emits a fallback).
 */
export function exactName(codepoint: number): string | undefined {
  if (codepoint >= 0x00 && codepoint <= 0x1f) return C0_CONTROL_NAMES[codepoint];
  if (codepoint === 0x7f) return 'DELETE';
  if (codepoint >= 0x80 && codepoint <= 0x9f) return C1_CONTROL_NAMES[codepoint - 0x80];
  return CURATED_NAMES[codepoint];
}

/**
 * A name for any code point. Prefers an exact standard name (see `exactName`);
 * otherwise returns a principled, clearly-synthetic fallback built from the
 * `U+XXXX` notation and the supplied general category — never a guessed UCD
 * name. With a category: `U+4E2D (letter)`. Without one: `CODE POINT U+4E2D`.
 */
export function codepointName(codepoint: number, category?: string): string {
  const exact = exactName(codepoint);
  if (exact !== undefined) return exact;
  const hex = toHex(codepoint);
  return category !== undefined && category.length > 0 ? `${hex} (${category})` : `CODE POINT ${hex}`;
}

/** Count of curated (non-algorithmic) entries — handy for tests / docs. */
export const CURATED_NAME_COUNT = Object.keys(CURATED_NAMES).length;
