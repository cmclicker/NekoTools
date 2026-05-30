import type { SortReport } from './kinds.js';

/**
 * NekoSort Pro generator. Backs ONE of the two declared Pro exporters:
 * `sort.export.frequency` (pro entitlement `frequency.count`).
 *
 * The other declared Pro id — `sort.export.diff` (`export.diff`) — would
 * diff the original input against the transformed output, but the
 * `sort.parsed` artifact retains only the OUTPUT lines + counts, not the
 * pre-transform input. A faithful input/output diff therefore needs data the
 * artifact does not carry, so it stays advertising-only (not registered) —
 * the same "artifact doesn't retain the inputs" disqualifier as NekoYAML's
 * roundtrip diff.
 *
 * This generator is a pure, deterministic function of the parsed
 * `sort.parsed` lines — no network, no clock, no premium engine.
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
