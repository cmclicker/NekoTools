import { jsonWireKind, type JsonWireKind } from './tree-model.js';

/**
 * Phase 1.1g table model.
 *
 * The table view treats the document as an array of objects and
 * renders one row per element with one column per unique key across
 * the union of all object elements.
 *
 * Applicability rules — kept narrow for Phase 1.1g:
 *   - The root must be an array.
 *   - At least one element must be a plain object (non-null,
 *     non-array). That element's keys (plus any other object
 *     elements' keys) form the column set.
 *
 * Non-object array elements (primitives, nested arrays, null) still
 * occupy a row, but their cells are all `present: false`. This lets
 * the table view show the user that the array has heterogeneous
 * shape without dropping rows silently.
 *
 * No React, no DOM. Pure data → data. Tested without jsdom.
 */
export interface TableCell {
  readonly present: boolean;
  readonly value: unknown;
  readonly kind: JsonWireKind | null;
}

export interface TableRow {
  readonly index: number;
  readonly cells: ReadonlyMap<string, TableCell>;
  /** True iff the underlying element is a plain object. */
  readonly isObject: boolean;
}

export interface TableModel {
  readonly applicable: boolean;
  readonly notApplicableReason: string | null;
  readonly columns: readonly string[];
  readonly rows: readonly TableRow[];
}

const NOT_ARRAY = 'Table view requires a top-level JSON array.';
const NO_OBJECTS =
  'Table view requires at least one object element in the array (none of the elements are objects).';

export function buildTableModel(value: unknown): TableModel {
  if (!Array.isArray(value)) {
    return { applicable: false, notApplicableReason: NOT_ARRAY, columns: [], rows: [] };
  }

  const items = value;
  const columnSet = new Set<string>();
  let sawObject = false;

  for (const item of items) {
    if (isPlainObject(item)) {
      sawObject = true;
      for (const k of Object.keys(item)) columnSet.add(k);
    }
  }

  if (!sawObject) {
    return { applicable: false, notApplicableReason: NO_OBJECTS, columns: [], rows: [] };
  }

  const columns = [...columnSet].sort();

  const rows: TableRow[] = items.map((item, index) => {
    const isObj = isPlainObject(item);
    const cells = new Map<string, TableCell>();
    for (const col of columns) {
      if (isObj && Object.prototype.hasOwnProperty.call(item, col)) {
        const v = (item as Record<string, unknown>)[col];
        cells.set(col, { present: true, value: v, kind: jsonWireKind(v) });
      } else {
        cells.set(col, { present: false, value: undefined, kind: null });
      }
    }
    return { index, cells, isObject: isObj };
  });

  return { applicable: true, notApplicableReason: null, columns, rows };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Short human-display string for a cell's value (similar to tree-model summaries). */
export function formatCell(cell: TableCell): string {
  if (!cell.present) return '';
  switch (cell.kind) {
    case 'object': {
      const keys = Object.keys(cell.value as Record<string, unknown>);
      return `{${keys.length} key${keys.length === 1 ? '' : 's'}}`;
    }
    case 'array': {
      const arr = cell.value as readonly unknown[];
      return `[${arr.length} item${arr.length === 1 ? '' : 's'}]`;
    }
    case 'string':
      return JSON.stringify(cell.value);
    case 'number':
    case 'boolean':
      return String(cell.value);
    case 'null':
      return 'null';
    default:
      return '';
  }
}
