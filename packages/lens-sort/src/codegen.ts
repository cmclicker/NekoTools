import type { SortReport } from './kinds.js';

/**
 * NekoSort Pro generators, backing both declared Pro exporters:
 *   - `sort.export.frequency` (pro `frequency.count`)
 *   - `sort.export.diff` (pro `export.diff`)
 *
 * The diff exporter compares the original input lines against the transformed
 * output. The `sort.parsed` artifact now retains `inputLines` (added with this
 * exporter), so a faithful input→output diff is a pure function of the
 * artifact — no network, no clock, no premium engine.
 */

export interface FrequencyRow {
  readonly line: string;
  readonly count: number;
}

/**
 * Count occurrences of each distinct line in the result, ranked by count
 * descending (ties keep first-seen order). When `unique` was applied every
 * count is 1; otherwise these are the true multiplicities of the output.
 */
export function computeFrequency(report: SortReport): FrequencyRow[] {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const line of report.lines) {
    if (!counts.has(line)) {
      counts.set(line, 0);
      order.push(line);
    }
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  const rows = order.map((line) => ({ line, count: counts.get(line) ?? 0 }));
  // Stable sort by count desc: decorate with original index for tie-breaking.
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => b.row.count - a.row.count || a.i - b.i)
    .map((d) => d.row);
}

function csvField(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * `sort.export.frequency` — a CSV of `count,line`, most frequent first.
 * Reports the frequency of the lines present in the result.
 */
export function toFrequencyCsv(report: SortReport): string {
  const rows: string[] = ['count,line'];
  for (const r of computeFrequency(report)) {
    rows.push(`${r.count},${csvField(r.line)}`);
  }
  return rows.join('\n');
}

/**
 * `sort.export.diff` — a unified-diff-style view of the transform: lines
 * present in the input but dropped from the output are `- removed`; lines in
 * the output absent from the input would be `+ added` (sort/dedupe/trim never
 * invents lines, so adds are rare but handled for completeness); lines present
 * in both are context ` `. Because sort reorders, this is a multiset
 * membership diff (by line value + occurrence count), not a positional diff —
 * which is the honest shape for a sort/dedupe transform. Pure function of the
 * retained `inputLines` + result `lines`.
 */
export function toInputOutputDiff(report: SortReport): string {
  const input = report.inputLines ?? [];
  const output = report.lines;

  // Multiset counts so dedupe shows the right number of removed duplicates.
  const outCounts = new Map<string, number>();
  for (const l of output) outCounts.set(l, (outCounts.get(l) ?? 0) + 1);
  const inCounts = new Map<string, number>();
  for (const l of input) inCounts.set(l, (inCounts.get(l) ?? 0) + 1);

  const lines: string[] = [
    `--- input (${input.length} line${input.length === 1 ? '' : 's'})`,
    `+++ output (${output.length} line${output.length === 1 ? '' : 's'})`,
  ];

  // Removed: input occurrences beyond what the output keeps (dropped/deduped),
  // walked in input order so the diff reads against the original.
  const keptBudget = new Map(outCounts);
  for (const l of input) {
    const budget = keptBudget.get(l) ?? 0;
    if (budget > 0) {
      keptBudget.set(l, budget - 1);
      lines.push(`  ${l}`);
    } else {
      lines.push(`- ${l}`);
    }
  }

  // Added: any output line whose count exceeds the input's (defensive; sort
  // transforms don't add lines, but keep the diff total/honest).
  for (const [l, outN] of outCounts) {
    const extra = outN - (inCounts.get(l) ?? 0);
    for (let i = 0; i < extra; i++) lines.push(`+ ${l}`);
  }

  return lines.join('\n');
}
