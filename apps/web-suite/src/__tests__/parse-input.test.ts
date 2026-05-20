import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '@nekotools/tool-runtime';
import { buildJsonRegistration, FIXED_CLOCK } from '@nekotools/lens-json';
import { parseInput, utf8ByteLength } from '../parse-input.js';

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildJsonRegistration(FIXED_CLOCK('2026-05-20T00:00:00.000Z')));
  return r;
}

describe('utf8ByteLength', () => {
  it('matches JS string length for ASCII', () => {
    expect(utf8ByteLength('')).toBe(0);
    expect(utf8ByteLength('ascii')).toBe(5);
    expect(utf8ByteLength('a'.repeat(100))).toBe(100);
  });

  it('counts two bytes for 2-byte UTF-8 characters (e.g. é)', () => {
    // é alone — 1 UTF-16 code unit, 2 UTF-8 bytes.
    expect('é'.length).toBe(1);
    expect(utf8ByteLength('é')).toBe(2);
  });

  it('counts four bytes for a JSON-quoted é (the auditor\'s example)', () => {
    // "é" is " + é + " — 3 UTF-16 code units, 4 UTF-8 bytes.
    expect(utf8ByteLength('"é"')).toBe(4);
  });

  it('counts four bytes for an emoji codepoint outside the BMP', () => {
    // 🐱 is a 4-byte UTF-8 sequence and a surrogate pair in UTF-16
    // (length 2).
    expect('🐱'.length).toBe(2);
    expect(utf8ByteLength('🐱')).toBe(4);
  });
});

describe('parseInput: hasDocument distinguishes valid null from missing artifact', () => {
  it('valid literal `null` produces hasDocument=true and value=null', () => {
    const r = registry();
    const result = parseInput(r, 'null');
    expect(result.hasDocument).toBe(true);
    expect(result.value).toBe(null);
    expect(result.diagnostics).toEqual([]);
  });

  it('invalid input produces hasDocument=false and value=undefined', () => {
    const r = registry();
    const result = parseInput(r, '{"oops":');
    expect(result.hasDocument).toBe(false);
    expect(result.value).toBeUndefined();
    // syntax_error is surfaced.
    expect(result.diagnostics.some((d) => d.code === 'json.syntax_error')).toBe(true);
  });

  it('valid object produces hasDocument=true and the parsed value', () => {
    const r = registry();
    const result = parseInput(r, '{"a":1}');
    expect(result.hasDocument).toBe(true);
    expect(result.value).toEqual({ a: 1 });
  });

  it('empty input produces hasDocument=false (no document artifact)', () => {
    const r = registry();
    const result = parseInput(r, '   ');
    expect(result.hasDocument).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.diagnostics.some((d) => d.code === 'json.empty_input')).toBe(true);
  });
});

describe('parseInput: sourceBytes reflects UTF-8 byte length, not JS string length', () => {
  it('records ASCII length verbatim', () => {
    const r = registry();
    expect(parseInput(r, '{}').sourceBytes).toBe(2);
    expect(parseInput(r, '{"hello":1}').sourceBytes).toBe(11);
  });

  it('records UTF-8 byte length for non-ASCII content', () => {
    const r = registry();
    // "é" — three UTF-16 code units but four UTF-8 bytes.
    expect(parseInput(r, '"é"').sourceBytes).toBe(4);
  });

  it('records UTF-8 byte length for supplementary-plane characters', () => {
    const r = registry();
    // "🐱" — quote + 4-byte emoji + quote = 6 UTF-8 bytes.
    // (The JS string length is 4: " + 2-unit surrogate pair + ".)
    expect(parseInput(r, '"🐱"').sourceBytes).toBe(6);
  });
});
