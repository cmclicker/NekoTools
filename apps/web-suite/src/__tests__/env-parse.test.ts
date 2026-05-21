import { describe, expect, it } from 'vitest';

import { computeEnvDiff, parseEnvText, utf8ByteLength } from '../env-parse.js';

describe('utf8ByteLength', () => {
  it('returns ASCII length for ASCII inputs', () => {
    expect(utf8ByteLength('')).toBe(0);
    expect(utf8ByteLength('A=1\n')).toBe(4);
  });

  it('counts é as 2 UTF-8 bytes, not 1 UTF-16 code unit', () => {
    // 'A=é\n' is 4 chars (UTF-16 code units) but 5 UTF-8 bytes —
    // é is U+00E9 which encodes to 0xC3 0xA9. Reintroducing
    // raw.length here would say 4. This test pins the fix that the
    // UI layer agrees with the parser's own UTF-8 measurement.
    expect(utf8ByteLength('A=é\n')).toBe(5);
  });

  it('counts cat emoji as 4 UTF-8 bytes (surrogate pair, 2 UTF-16 code units)', () => {
    // U+1F431 🐱 is 4 UTF-8 bytes and 2 UTF-16 code units. JS string
    // length sees 2; UTF-8 length is 4.
    const s = '🐱';
    expect(s.length).toBe(2);
    expect(utf8ByteLength(s)).toBe(4);
  });
});

describe('parseEnvText', () => {
  it('records source.bytes as the UTF-8 byte length, not raw.length', () => {
    const result = parseEnvText('A=é\n');
    // The artifact's source.kind is 'paste' and source.bytes is what
    // the helper measured. The test confirms it agrees with the
    // separate utf8ByteLength helper rather than raw.length.
    expect(result.inputBytes).toBe(5);
    expect(result.artifact?.source).toEqual({ kind: 'paste', bytes: 5 });
  });

  it('produces an env.document artifact for a simple input', () => {
    const result = parseEnvText('A=1\nB=two\n');
    expect(result.hasDocument).toBe(true);
    expect(result.document?.entries.map((e) => e.key)).toEqual(['A', 'B']);
  });

  it('surfaces env.empty_input as info (not error) for whitespace-only input', () => {
    const result = parseEnvText('   \n');
    expect(result.hasDocument).toBe(true);
    const diag = result.diagnostics.find((d) => d.code === 'env.empty_input');
    expect(diag?.severity).toBe('info');
  });

  it('surfaces env.duplicate_key warning when a key repeats', () => {
    const result = parseEnvText('A=1\nA=2\n');
    expect(result.diagnostics.find((d) => d.code === 'env.duplicate_key')).toBeDefined();
  });
});

describe('computeEnvDiff', () => {
  it('returns null when either side is null', () => {
    expect(computeEnvDiff(null, null)).toBeNull();
    expect(computeEnvDiff(parseEnvText('A=1\n').artifact, null)).toBeNull();
    expect(computeEnvDiff(null, parseEnvText('A=1\n').artifact)).toBeNull();
  });

  it('returns an env.diff with all-equal hunks for identical documents', () => {
    const left = parseEnvText('A=1\n').artifact;
    const right = parseEnvText('A=1\n').artifact;
    const diff = computeEnvDiff(left, right);
    expect(diff).not.toBeNull();
    expect(diff?.hunks.every((h) => h.kind === 'equal')).toBe(true);
  });

  it('returns add/remove hunks when values differ', () => {
    const left = parseEnvText('A=1\n').artifact;
    const right = parseEnvText('A=2\n').artifact;
    const diff = computeEnvDiff(left, right);
    expect(diff?.hunks.some((h) => h.kind === 'add')).toBe(true);
    expect(diff?.hunks.some((h) => h.kind === 'remove')).toBe(true);
  });
});
