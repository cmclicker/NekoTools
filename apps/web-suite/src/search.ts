import type { TreeNode } from './tree-model.js';
import { formatCell, type TableRow } from './table-model.js';

/**
 * Phase 1.1g search helpers.
 *
 * Case-insensitive substring match. The contract is intentionally
 * conservative — no regex, no fuzzy matching, no field-scoped queries.
 * That keeps the search bar predictable for the user and the logic
 * straightforward to test.
 *
 * The tree filter keeps ancestors of matched nodes visible so the
 * user retains the path context. Otherwise a deep match would
 * orphan into a single row.
 */

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesQuery(text: string, normalizedQuery: string): boolean {
  if (normalizedQuery === '') return true;
  return text.toLowerCase().includes(normalizedQuery);
}

/**
 * Return the subset of `nodes` that should remain visible for the
 * given query. A node is kept if:
 *   - its `key` matches the query, OR
 *   - its `summary` matches the query, OR
 *   - it is an ancestor (by depth + pointer prefix) of a node that
 *     does.
 *
 * The empty query returns every node unchanged.
 */
export function filterTreeNodes(
  nodes: readonly TreeNode[],
  query: string,
): readonly TreeNode[] {
  const normalized = normalizeQuery(query);
  if (normalized === '') return nodes;

  const matchedIdx = new Set<number>();
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]!;
    if (matchesQuery(n.key, normalized) || matchesQuery(n.summary, normalized)) {
      matchedIdx.add(i);
    }
  }

  if (matchedIdx.size === 0) return [];

  // Walk in source order and keep ancestors (lower depth, occurring
  // before a matched node, with no other same-or-lower-depth node in
  // between) as well as the matched nodes themselves. Because the
  // tree-model flattener emits parents before children, an ancestor
  // is always the most recent node at each depth strictly less than
  // the matched node's depth.
  const visible = new Set<number>();
  const ancestorAtDepth = new Map<number, number>();
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]!;
    // Drop ancestor markers at depths >= this node's depth — they
    // belong to a closed sibling.
    for (const d of [...ancestorAtDepth.keys()]) {
      if (d >= n.depth) ancestorAtDepth.delete(d);
    }
    if (matchedIdx.has(i)) {
      visible.add(i);
      for (const ancestorIdx of ancestorAtDepth.values()) visible.add(ancestorIdx);
    }
    ancestorAtDepth.set(n.depth, i);
  }

  return nodes.filter((_, i) => visible.has(i));
}

/**
 * Return the subset of `rows` whose visible cells contain the query.
 * The row index column itself is not part of the match — only the
 * user-facing cell contents.
 */
export function filterTableRows(
  rows: readonly TableRow[],
  columns: readonly string[],
  query: string,
): readonly TableRow[] {
  const normalized = normalizeQuery(query);
  if (normalized === '') return rows;

  return rows.filter((row) => {
    for (const col of columns) {
      const cell = row.cells.get(col);
      if (!cell) continue;
      if (!cell.present) continue;
      const display = formatCell(cell);
      if (matchesQuery(display, normalized)) return true;
      // Also match the raw key name; useful for "find rows where
      // any cell has key X" — but only when the key actually has a
      // present cell on that row.
      if (matchesQuery(col, normalized)) return true;
    }
    return false;
  });
}
