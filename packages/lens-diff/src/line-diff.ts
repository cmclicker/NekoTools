import type { DiffHunk, DiffSummary } from './kinds.js';

/**
 * LCS-backed line diff. Returns hunks top-to-bottom (source order).
 *
 * Complexity: O(m·n) time and space. Fine for the input range NekoDiff
 * targets; the `diff.large_input` diagnostic warns before this gets
 * expensive. This is the same proven shape NekoJSON uses for its textual
 * diff, but NekoDiff owns its copy so the engine's core is testable in
 * isolation and not coupled to another lens's artifact type.
 */
export function computeLineDiff(
  a: readonly string[],
  b: readonly string[],
): readonly DiffHunk[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i += 1) dp.push(new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = (dp[i - 1]?.[j - 1] ?? 0) + 1;
      } else {
        const up = dp[i - 1]?.[j] ?? 0;
        const left = dp[i]?.[j - 1] ?? 0;
        dp[i]![j] = up >= left ? up : left;
      }
    }
  }

  const hunks: DiffHunk[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      hunks.push({ kind: 'equal', text: a[i - 1] ?? '', leftLine: i, rightLine: j });
      i -= 1;
      j -= 1;
      continue;
    }
    const up = i > 0 ? (dp[i - 1]?.[j] ?? 0) : -1;
    const left = j > 0 ? (dp[i]?.[j - 1] ?? 0) : -1;
    if (j > 0 && left >= up) {
      hunks.push({ kind: 'add', text: b[j - 1] ?? '', rightLine: j });
      j -= 1;
    } else {
      hunks.push({ kind: 'remove', text: a[i - 1] ?? '', leftLine: i });
      i -= 1;
    }
  }
  hunks.reverse();
  return hunks;
}

/** Aggregate hunk counts into a {@link DiffSummary}. */
export function summarize(hunks: readonly DiffHunk[]): DiffSummary {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const h of hunks) {
    if (h.kind === 'add') added += 1;
    else if (h.kind === 'remove') removed += 1;
    else unchanged += 1;
  }
  return {
    added,
    removed,
    unchanged,
    changed: added + removed,
    identical: added === 0 && removed === 0,
  };
}

/** Split raw text into lines for diffing. The empty string yields zero lines. */
export function toLines(raw: string): readonly string[] {
  return raw === '' ? [] : raw.split('\n');
}
