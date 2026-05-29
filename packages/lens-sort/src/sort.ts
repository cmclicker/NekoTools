/**
 * Self-contained line-transform core: sort, dedupe, reverse, trim a list of
 * lines with the usual options. No deps, no network.
 */

export type SortOrder = 'asc' | 'desc' | 'original';

export interface SortOptions {
  readonly order: SortOrder;
  readonly unique: boolean;
  readonly caseInsensitive: boolean;
  readonly numeric: boolean;
  readonly trimLines: boolean;
  /** Drop blank lines from the result. */
  readonly removeBlank: boolean;
}

export const DEFAULT_OPTIONS: SortOptions = {
  order: 'asc',
  unique: false,
  caseInsensitive: false,
  numeric: false,
  trimLines: false,
  removeBlank: false,
};

export interface SortResult {
  readonly inputCount: number;
  readonly outputCount: number;
  readonly removed: number;
  readonly lines: readonly string[];
}

function compareLines(a: string, b: string, opts: SortOptions): number {
  if (opts.numeric) {
    const na = parseFloat(a);
    const nb = parseFloat(b);
    const aNum = !Number.isNaN(na);
    const bNum = !Number.isNaN(nb);
    if (aNum && bNum && na !== nb) return na < nb ? -1 : 1;
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
    // fall through to string compare when equal or both non-numeric
  }
  const x = opts.caseInsensitive ? a.toLowerCase() : a;
  const y = opts.caseInsensitive ? b.toLowerCase() : b;
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
}

/** Apply the transform to raw text and return the resulting lines + stats. */
export function transformLines(raw: string, opts: SortOptions): SortResult {
  let lines = raw.split(/\r?\n/);
  // A trailing newline produces a final empty element; drop it so counts are intuitive.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines = lines.slice(0, -1);
  const inputCount = lines.length;

  if (opts.trimLines) lines = lines.map((l) => l.trim());
  if (opts.removeBlank) lines = lines.filter((l) => l.trim() !== '');

  if (opts.unique) {
    const seen = new Set<string>();
    lines = lines.filter((l) => {
      const key = opts.caseInsensitive ? l.toLowerCase() : l;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (opts.order !== 'original') {
    // Stable sort: decorate with original index for ties.
    lines = lines
      .map((line, i) => ({ line, i }))
      .sort((a, b) => compareLines(a.line, b.line, opts) || a.i - b.i)
      .map((d) => d.line);
    if (opts.order === 'desc') lines = lines.reverse();
  }

  return { inputCount, outputCount: lines.length, removed: inputCount - lines.length, lines };
}
