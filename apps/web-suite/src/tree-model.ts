/**
 * Pure helper that flattens a JSON value into a renderable node list.
 *
 * Each node carries:
 *   - `pointer`  — RFC 6901 JSON Pointer to this node (`""` for root)
 *   - `key`      — display label (object key, array index, or `(root)`)
 *   - `kind`     — JSON wire type
 *   - `depth`    — nesting level (0 for root)
 *   - `isLeaf`   — true for primitives + empty containers
 *   - `summary`  — short summary string for leaves and collapsed nodes
 *   - `childCount` — number of immediate children (0 for leaves)
 *
 * Flattening (instead of nesting) keeps the React component simple:
 * the tree renders as a flat list with depth-based indent, and
 * expansion/collapse is just a `Set<string>` of pointers.
 *
 * No React, no DOM. Pure data → data. Tested without jsdom.
 */
export interface TreeNode {
  readonly pointer: string;
  readonly key: string;
  readonly kind: JsonWireKind;
  readonly depth: number;
  readonly isLeaf: boolean;
  readonly summary: string;
  readonly childCount: number;
}

export type JsonWireKind =
  | 'object'
  | 'array'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null';

interface FlattenOptions {
  /** Pointers whose children should be visible. Root is always expanded. */
  readonly expanded: ReadonlySet<string>;
}

/**
 * Flatten a JSON value into a visible-node list, honoring `expanded`.
 * A node is in the output if every ancestor is expanded (or it's the
 * root). Collapsed subtrees stop early — their children are omitted.
 */
export function flattenForTree(root: unknown, options: FlattenOptions): readonly TreeNode[] {
  const out: TreeNode[] = [];
  const expanded = options.expanded;
  walk(root, '', '(root)', 0, out, expanded, true);
  return out;
}

function walk(
  value: unknown,
  pointer: string,
  key: string,
  depth: number,
  out: TreeNode[],
  expanded: ReadonlySet<string>,
  isRoot: boolean,
): void {
  const kind = jsonWireKind(value);
  const isContainer = kind === 'object' || kind === 'array';
  const childCount = isContainer ? containerSize(value) : 0;
  const isLeaf = !isContainer || childCount === 0;

  out.push({
    pointer,
    key,
    kind,
    depth,
    isLeaf,
    summary: summarize(value, kind, childCount),
    childCount,
  });

  if (!isContainer || childCount === 0) return;

  // Root is always treated as expanded; explicit expansion is required
  // for nested containers to render their children.
  if (!isRoot && !expanded.has(pointer)) return;

  if (kind === 'array') {
    const arr = value as readonly unknown[];
    for (let i = 0; i < arr.length; i += 1) {
      walk(arr[i], `${pointer}/${i}`, `[${i}]`, depth + 1, out, expanded, false);
    }
    return;
  }

  const obj = value as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    walk(obj[k], `${pointer}/${encodeKey(k)}`, k, depth + 1, out, expanded, false);
  }
}

export function jsonWireKind(value: unknown): JsonWireKind {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return t;
  return 'object';
}

function containerSize(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length;
  }
  return 0;
}

function summarize(value: unknown, kind: JsonWireKind, childCount: number): string {
  switch (kind) {
    case 'object':
      return childCount === 0 ? '{}' : `{${childCount} key${childCount === 1 ? '' : 's'}}`;
    case 'array':
      return childCount === 0
        ? '[]'
        : `[${childCount} item${childCount === 1 ? '' : 's'}]`;
    case 'string':
      return JSON.stringify(value);
    case 'number':
      return String(value);
    case 'boolean':
      return String(value);
    case 'null':
      return 'null';
  }
}

/** RFC 6901 token encoding: `~` -> `~0`, `/` -> `~1`. */
function encodeKey(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}
