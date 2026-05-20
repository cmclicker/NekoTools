import { describe, expect, it } from 'vitest';
import { resolveJsonPointer } from '../pointer-resolve.js';

const DOC = {
  user: { name: 'cody', tags: ['a', 'b', 'c'] },
  count: 42,
  nullable: null,
  'a/b': 1,
  '~c': 2,
};

describe('resolveJsonPointer: happy path', () => {
  it('returns the root for the empty pointer', () => {
    expect(resolveJsonPointer(DOC, '')).toEqual({ ok: true, value: DOC });
  });

  it('walks object keys', () => {
    expect(resolveJsonPointer(DOC, '/user/name')).toEqual({ ok: true, value: 'cody' });
  });

  it('walks array indices', () => {
    expect(resolveJsonPointer(DOC, '/user/tags/1')).toEqual({ ok: true, value: 'b' });
  });

  it('returns null when the resolved value is null', () => {
    expect(resolveJsonPointer(DOC, '/nullable')).toEqual({ ok: true, value: null });
  });

  it('decodes RFC 6901 ~0 / ~1 escapes', () => {
    expect(resolveJsonPointer(DOC, '/a~1b')).toEqual({ ok: true, value: 1 });
    expect(resolveJsonPointer(DOC, '/~0c')).toEqual({ ok: true, value: 2 });
  });
});

describe('resolveJsonPointer: failure modes', () => {
  it('rejects a pointer that does not start with /', () => {
    const r = resolveJsonPointer(DOC, 'foo');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/must start with/);
  });

  it('reports an unknown key', () => {
    const r = resolveJsonPointer(DOC, '/user/missing');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/key "missing" not found/);
  });

  it('reports an out-of-bounds array index', () => {
    const r = resolveJsonPointer(DOC, '/user/tags/99');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/out of bounds/);
  });

  it('rejects non-integer array index tokens', () => {
    const r = resolveJsonPointer(DOC, '/user/tags/zero');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/non-negative integer index/);
  });

  it('reports a descent attempt through a non-container', () => {
    const r = resolveJsonPointer(DOC, '/count/x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cannot descend/);
  });
});
