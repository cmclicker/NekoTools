import { describe, expect, it } from 'vitest';
import { buildTableModel, formatCell } from '../table-model.js';

describe('buildTableModel: applicability', () => {
  it('returns not-applicable when the root is not an array', () => {
    const m = buildTableModel({ a: 1 });
    expect(m.applicable).toBe(false);
    expect(m.notApplicableReason).toMatch(/top-level JSON array/);
    expect(m.rows).toEqual([]);
    expect(m.columns).toEqual([]);
  });

  it('returns not-applicable when the array has no object elements', () => {
    const m = buildTableModel([1, 2, 'three']);
    expect(m.applicable).toBe(false);
    expect(m.notApplicableReason).toMatch(/at least one object element/);
  });

  it('is applicable for an array of plain objects', () => {
    const m = buildTableModel([{ a: 1 }, { b: 2 }]);
    expect(m.applicable).toBe(true);
    expect(m.columns).toEqual(['a', 'b']);
    expect(m.rows).toHaveLength(2);
  });

  it('is applicable for a mixed array if at least one element is an object', () => {
    const m = buildTableModel([{ k: 1 }, 42, null]);
    expect(m.applicable).toBe(true);
    expect(m.columns).toEqual(['k']);
    expect(m.rows).toHaveLength(3);
  });
});

describe('buildTableModel: rows and cells', () => {
  it('emits one row per array element, in order', () => {
    const m = buildTableModel([{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(m.rows.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(m.rows.map((r) => r.cells.get('a')?.value)).toEqual([1, 2, 3]);
  });

  it('fills missing keys with present=false cells', () => {
    const m = buildTableModel([{ a: 1, b: 2 }, { a: 10 }]);
    const row1 = m.rows[1]!;
    expect(row1.cells.get('a')?.present).toBe(true);
    expect(row1.cells.get('a')?.value).toBe(10);
    expect(row1.cells.get('b')?.present).toBe(false);
  });

  it('marks non-object rows with isObject=false and empty cells', () => {
    const m = buildTableModel([{ a: 1 }, 'not-an-object']);
    expect(m.rows[1]?.isObject).toBe(false);
    expect(m.rows[1]?.cells.get('a')?.present).toBe(false);
  });

  it('preserves a value of null as a present cell with kind=null', () => {
    const m = buildTableModel([{ a: null }]);
    const cell = m.rows[0]!.cells.get('a')!;
    expect(cell.present).toBe(true);
    expect(cell.value).toBeNull();
    expect(cell.kind).toBe('null');
  });
});

describe('formatCell', () => {
  it('renders primitives with sensible display strings', () => {
    expect(formatCell({ present: true, value: 'x', kind: 'string' })).toBe('"x"');
    expect(formatCell({ present: true, value: 42, kind: 'number' })).toBe('42');
    expect(formatCell({ present: true, value: true, kind: 'boolean' })).toBe('true');
    expect(formatCell({ present: true, value: null, kind: 'null' })).toBe('null');
  });

  it('renders containers as count summaries', () => {
    expect(formatCell({ present: true, value: { x: 1, y: 2 }, kind: 'object' })).toBe('{2 keys}');
    expect(formatCell({ present: true, value: [1, 2, 3], kind: 'array' })).toBe('[3 items]');
    expect(formatCell({ present: true, value: {}, kind: 'object' })).toBe('{0 keys}');
  });

  it('returns an empty string for absent cells', () => {
    expect(formatCell({ present: false, value: undefined, kind: null })).toBe('');
  });
});
