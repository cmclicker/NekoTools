import { describe, expect, it } from 'vitest';
import { flattenForTree, jsonWireKind } from '../tree-model.js';

describe('jsonWireKind', () => {
  it('distinguishes the six JSON wire types', () => {
    expect(jsonWireKind({})).toBe('object');
    expect(jsonWireKind([])).toBe('array');
    expect(jsonWireKind('x')).toBe('string');
    expect(jsonWireKind(1)).toBe('number');
    expect(jsonWireKind(true)).toBe('boolean');
    expect(jsonWireKind(null)).toBe('null');
  });
});

describe('flattenForTree', () => {
  it('emits a single root node for a primitive', () => {
    const nodes = flattenForTree(42, { expanded: new Set() });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.pointer).toBe('');
    expect(nodes[0]?.kind).toBe('number');
    expect(nodes[0]?.isLeaf).toBe(true);
  });

  it('expands the root container by default', () => {
    // Root is always treated as expanded — children show even when
    // the expanded set is empty.
    const nodes = flattenForTree({ a: 1, b: 2 }, { expanded: new Set() });
    expect(nodes.map((n) => n.pointer)).toEqual(['', '/a', '/b']);
  });

  it('respects collapse for nested containers', () => {
    // /a is collapsed; its children should NOT appear.
    const value = { a: { b: 1, c: 2 }, d: 3 };
    const nodes = flattenForTree(value, { expanded: new Set([]) });
    const pointers = nodes.map((n) => n.pointer);
    expect(pointers).toEqual(['', '/a', '/d']);
  });

  it('expands a nested container when its pointer is in the expanded set', () => {
    const value = { a: { b: 1, c: 2 }, d: 3 };
    const nodes = flattenForTree(value, { expanded: new Set(['/a']) });
    const pointers = nodes.map((n) => n.pointer);
    expect(pointers).toEqual(['', '/a', '/a/b', '/a/c', '/d']);
  });

  it('encodes array indices as integer tokens in pointers', () => {
    const nodes = flattenForTree([10, 20], { expanded: new Set() });
    expect(nodes.map((n) => n.pointer)).toEqual(['', '/0', '/1']);
    expect(nodes[1]?.key).toBe('[0]');
  });

  it('encodes ~ and / in keys per RFC 6901', () => {
    const value = { 'a/b': 1, '~c': 2 };
    const nodes = flattenForTree(value, { expanded: new Set() });
    const pointers = nodes.map((n) => n.pointer);
    expect(pointers).toContain('/a~1b');
    expect(pointers).toContain('/~0c');
  });

  it('marks empty containers as leaves', () => {
    const nodes = flattenForTree({ a: {}, b: [] }, { expanded: new Set() });
    const a = nodes.find((n) => n.pointer === '/a');
    const b = nodes.find((n) => n.pointer === '/b');
    expect(a?.isLeaf).toBe(true);
    expect(b?.isLeaf).toBe(true);
  });

  it('produces sensible summaries', () => {
    const nodes = flattenForTree(
      { obj: { a: 1, b: 2 }, arr: [1, 2, 3], str: 'hi', n: 42, b: true, x: null },
      { expanded: new Set() },
    );
    const summaryByPointer = Object.fromEntries(nodes.map((n) => [n.pointer, n.summary]));
    expect(summaryByPointer['/obj']).toBe('{2 keys}');
    expect(summaryByPointer['/arr']).toBe('[3 items]');
    expect(summaryByPointer['/str']).toBe('"hi"');
    expect(summaryByPointer['/n']).toBe('42');
    expect(summaryByPointer['/b']).toBe('true');
    expect(summaryByPointer['/x']).toBe('null');
  });
});
