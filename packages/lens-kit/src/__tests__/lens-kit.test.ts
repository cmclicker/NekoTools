import { describe, expect, it } from 'vitest';

import { FIXED_CLOCK, makeIdFactory } from '../index.js';

describe('lens-kit: FIXED_CLOCK', () => {
  it('always returns the supplied ISO timestamp', () => {
    const clock = FIXED_CLOCK('2026-05-21T00:00:00.000Z');
    expect(clock.now()).toBe('2026-05-21T00:00:00.000Z');
    expect(clock.now()).toBe('2026-05-21T00:00:00.000Z');
  });
});

describe('lens-kit: makeIdFactory', () => {
  it('produces prefixed, monotonically increasing ids', () => {
    const ids = makeIdFactory('art');
    expect(ids()).toBe('art_1');
    expect(ids()).toBe('art_2');
    expect(ids()).toBe('art_3');
  });

  it('independent factories keep independent counters', () => {
    const a = makeIdFactory('a');
    const b = makeIdFactory('b');
    expect(a()).toBe('a_1');
    expect(b()).toBe('b_1');
    expect(a()).toBe('a_2');
  });
});
