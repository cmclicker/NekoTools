import type { Artifact } from '@nekotools/contracts';

import type { SortOptions } from './sort.js';

/**
 * NekoSort artifact kinds (namespaced under `sort.*`).
 *
 *   `sort.parsed` — the result of sorting/deduping/transforming a block of
 *                   lines, with the options used and input/output/removed
 *                   counts. Pure string transforms; no network.
 */
export const SORT_KIND_PARSED = 'sort.parsed';

export const ALL_SORT_KINDS = [SORT_KIND_PARSED] as const;

/** The parsed body of a `sort.parsed` artifact. */
export interface SortReport {
  readonly options: SortOptions;
  readonly inputCount: number;
  readonly outputCount: number;
  readonly removed: number;
  readonly lines: readonly string[];
}

export type SortParsedArtifact = Artifact<'sort.parsed', SortReport>;
export type SortArtifact = SortParsedArtifact;

export const SORT_PARSED_EXPORT_KINDS = [SORT_KIND_PARSED] as const;
