import { describe, expect, it } from 'vitest';
import {
  filterTableRows,
  filterTreeNodes,
  matchesQuery,
  normalizeQuery,
} from '../search.js';
import { flattenForTree } from '../tree-model.js';
import { buildTableModel } from '../table-model.js';

describe('matchesQuery / normalizeQuery', () => {
  it('matches case-insensitively', () => {
    expect(matchesQuery('Hello World', 'hello')).toBe(true);
    expect(matchesQuery('HELLO', 'lo')).toBe(true);
  });

  it('treats an empty normalized query as "match everything"', () => {
    expect(matchesQuery('anything', '')).toBe(true);
  });

  it('does not match when the query is absent from the text', () => {
    expect(matchesQuery('hello', 'zzz')).toBe(false);
  });

  it('normalizeQuery lowercases and trims', () => {
    expect(normalizeQuery('  HeLlO  ')).toBe('hello');
    expect(normalizeQuery('')).toBe('');
  });
});

describe('filterTreeNodes', () => {
  it('returns the same list when the query is empty', () => {
    const nodes = flattenForTree({ a: 1 }, { expanded: new Set([''])});
    expect(filterTreeNodes(nodes, '')).toEqual(nodes);
    expect(filterTreeNodes(nodes, '   ')).toEqual(nodes);
  });

  it('returns matching nodes plus their ancestors', () => {
    // Root contains "outer" containing "needle: 1". Query "needle"
    // should keep (root), outer, and needle. Sibling "other" should
    // be filtered out.
    const value = { outer: { needle: 1, other: 2 }, sibling: 3 };
    const nodes = flattenForTree(value, {
      expanded: new Set(['', '/outer']),
    });
    const visible = filterTreeNodes(nodes, 'needle');
    const keys = visible.map((n) => n.key);
    expect(keys).toContain('(root)');
    expect(keys).toContain('outer');
    expect(keys).toContain('needle');
    expect(keys).not.toContain('other');
    expect(keys).not.toContain('sibling');
  });

  it('matches on summary text (e.g. string value content)', () => {
    const value = { greeting: 'hello world' };
    const nodes = flattenForTree(value, { expanded: new Set([''])});
    const visible = filterTreeNodes(nodes, 'world');
    expect(visible.some((n) => n.key === 'greeting')).toBe(true);
  });

  it('returns an empty list when no nodes match', () => {
    const nodes = flattenForTree({ a: 1 }, { expanded: new Set([''])});
    expect(filterTreeNodes(nodes, 'zzz')).toEqual([]);
  });
});

describe('filterTableRows', () => {
  it('returns all rows when the query is empty', () => {
    const m = buildTableModel([{ a: 1 }, { a: 2 }]);
    expect(filterTableRows(m.rows, m.columns, '')).toEqual(m.rows);
  });

  it('keeps only rows whose cell display contains the query', () => {
    const m = buildTableModel([
      { name: 'alice', age: 30 },
      { name: 'bob', age: 25 },
    ]);
    const filtered = filterTableRows(m.rows, m.columns, 'alice');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.cells.get('name')?.value).toBe('alice');
  });

  it('matches numeric cell values via their string form', () => {
    const m = buildTableModel([{ n: 42 }, { n: 7 }]);
    const filtered = filterTableRows(m.rows, m.columns, '42');
    expect(filtered).toHaveLength(1);
  });

  it('matches column names too when there is a present cell in that column', () => {
    // Search by column name surfaces rows that have that key, which
    // is the user-friendly interpretation of "find rows with X".
    const m = buildTableModel([{ user: 'a' }, { user: 'b' }, { admin: true }]);
    const filtered = filterTableRows(m.rows, m.columns, 'user');
    expect(filtered.map((r) => r.index)).toEqual([0, 1]);
  });
});
