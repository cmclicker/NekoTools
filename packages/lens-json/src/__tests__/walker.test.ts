import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '@nekotools/contracts';
import { tokenize } from '../tokenizer.js';
import { walkForDiagnostics } from '../walker-diagnostics.js';
import { makeIdFactory } from '../util.js';

function walk(source: string): readonly Diagnostic[] {
  return walkForDiagnostics(tokenize(source), makeIdFactory('diag'));
}

function codes(diagnostics: readonly Diagnostic[]): readonly string[] {
  return diagnostics.map((d) => d.code);
}

describe('walker: clean JSON emits nothing', () => {
  it('a flat object with unique keys produces no diagnostics', () => {
    expect(walk('{"a":1,"b":2}')).toEqual([]);
  });

  it('a nested object/array with unique keys produces no diagnostics', () => {
    expect(walk('{"items":[1,2,{"k":3}],"meta":{"n":4}}')).toEqual([]);
  });

  it('empty object and empty array produce no diagnostics', () => {
    expect(walk('{}')).toEqual([]);
    expect(walk('[]')).toEqual([]);
  });

  it('primitive root values produce no diagnostics', () => {
    expect(walk('42')).toEqual([]);
    expect(walk('"hello"')).toEqual([]);
    expect(walk('null')).toEqual([]);
    expect(walk('true')).toEqual([]);
  });
});

describe('walker: trailing_comma', () => {
  it('emits a single warning for a trailing comma before }', () => {
    const diagnostics = walk('{"a":1,}');
    expect(codes(diagnostics)).toEqual(['json.trailing_comma']);
    const d = diagnostics[0]!;
    expect(d.severity).toBe('warning');
    expect(d.message).toContain('"}"');
    // span should point at the comma, which is the 7th char (index 6).
    expect(d.span?.startOffset).toBe(6);
    expect(d.span?.endOffset).toBe(7);
  });

  it('emits a single warning for a trailing comma before ]', () => {
    const diagnostics = walk('[1,2,]');
    expect(codes(diagnostics)).toEqual(['json.trailing_comma']);
    expect(diagnostics[0]?.message).toContain('"]"');
  });

  it('emits one warning per nested trailing comma', () => {
    const diagnostics = walk('[1,[2,3,],4,]');
    expect(codes(diagnostics)).toEqual(['json.trailing_comma', 'json.trailing_comma']);
  });

  it('does not emit for a leading or interior comma', () => {
    // `[1,2,3]` has commas, but none are immediately before `]`.
    expect(walk('[1,2,3]')).toEqual([]);
  });

  it('emits for `[,]` (lone comma between brackets)', () => {
    // The comma is immediately before `]`; the walker fires. JSON.parse
    // will reject the input separately via json.syntax_error.
    const diagnostics = walk('[,]');
    expect(codes(diagnostics)).toEqual(['json.trailing_comma']);
  });

  it('does NOT fire on a clean close', () => {
    expect(walk('{"a":1}')).toEqual([]);
    expect(walk('[1,2]')).toEqual([]);
  });
});

describe('walker: duplicate_key', () => {
  it('emits a warning for a duplicate key, pointing at the second occurrence', () => {
    const diagnostics = walk('{"a":1,"a":2}');
    expect(codes(diagnostics)).toEqual(['json.duplicate_key']);
    const d = diagnostics[0]!;
    expect(d.severity).toBe('warning');
    expect(d.message).toContain('"a"');
    expect(d.message).toContain('first defined at line 1');
    // Second occurrence string starts at offset 7 (after `,`).
    expect(d.span?.startOffset).toBe(7);
    expect(d.span?.endOffset).toBe(10);
  });

  it('emits one warning per duplicate occurrence (three "a"s -> two warnings)', () => {
    const diagnostics = walk('{"a":1,"a":2,"a":3}');
    expect(codes(diagnostics)).toEqual(['json.duplicate_key', 'json.duplicate_key']);
  });

  it('distinguishes duplicates per object scope (sibling objects do not collide)', () => {
    // The `"k"` keys live in independent object scopes — not a duplicate.
    expect(walk('{"a":{"k":1},"b":{"k":2}}')).toEqual([]);
  });

  it('detects duplicates inside a nested object', () => {
    const diagnostics = walk('{"outer":{"k":1,"k":2}}');
    expect(codes(diagnostics)).toEqual(['json.duplicate_key']);
  });

  it('does NOT treat repeated string values as duplicate keys', () => {
    // "a" appears twice but the second occurrence is a value, not a key.
    expect(walk('{"k1":"a","k2":"a"}')).toEqual([]);
  });

  it('does NOT treat array string entries as object keys', () => {
    expect(walk('["a","a"]')).toEqual([]);
  });

  it('does NOT emit duplicate_key for an unclosed object scope', () => {
    // `{"a":1,"a":2` — no closing brace. The walker is conservative
    // and stays quiet; JSON.parse will fail loudly via json.syntax_error.
    expect(walk('{"a":1,"a":2')).toEqual([]);
  });
});

describe('walker: combined cases', () => {
  it('emits trailing_comma and duplicate_key independently in the same input', () => {
    const diagnostics = walk('{"a":1,"a":2,}');
    const cs = codes(diagnostics);
    expect(cs).toContain('json.duplicate_key');
    expect(cs).toContain('json.trailing_comma');
    expect(cs).toHaveLength(2);
  });

  it('diagnostic id factory is honored (ids are non-empty and unique within one walk)', () => {
    const diagnostics = walk('{"a":1,"a":2,"a":3,}');
    const ids = diagnostics.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.length).toBeGreaterThan(0);
  });
});
