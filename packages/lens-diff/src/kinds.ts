import type { Artifact } from '@nekotools/contracts';

/**
 * NekoDiff artifact kinds (all namespaced under `diff.*`).
 *
 *   `diff.result` — a line-level comparison between two inputs under one
 *                   compare mode (text / json / yaml). The result records
 *                   the mode, both side labels, the classified hunks, an
 *                   aggregate summary, and whether the two sides were
 *                   reducible to a comparable form at all.
 */
export const DIFF_KIND_RESULT = 'diff.result';

export const ALL_DIFF_KINDS = [DIFF_KIND_RESULT] as const;

/** Exporters render `diff.result`; narrow `accepts` per the NekoEnv lesson
 * (a wide accept list lets the runtime hand the wrong artifact to the wrong
 * exporter and emit empty output). */
export const DIFF_RESULT_EXPORT_KINDS = [DIFF_KIND_RESULT] as const;

/** The compare mode used to produce a diff. */
export type DiffMode = 'text' | 'json' | 'yaml';

/**
 * One line of diff output, classified relative to the two compared inputs.
 * Line numbers are 1-indexed (display convention); a line that only exists
 * on one side carries only that side's number.
 */
export type DiffHunk =
  | {
      readonly kind: 'equal';
      readonly text: string;
      readonly leftLine: number;
      readonly rightLine: number;
    }
  | { readonly kind: 'add'; readonly text: string; readonly rightLine: number }
  | { readonly kind: 'remove'; readonly text: string; readonly leftLine: number };

/** Aggregate counts over a diff's hunks. */
export interface DiffSummary {
  readonly added: number;
  readonly removed: number;
  readonly unchanged: number;
  /** Total differing lines (added + removed) — the "changed-count". */
  readonly changed: number;
  /** True when nothing was added or removed (the comparable forms match). */
  readonly identical: boolean;
}

/**
 * The body of a `diff.result` artifact: a line-level comparison between two
 * inputs under the selected mode.
 *
 *   text — raw line-by-line comparison.
 *   json — both sides parsed as JSON and compared in canonical form
 *          (recursively key-sorted, 2-space indent) so key reordering is
 *          not noise. Reuses NekoJSON's `canonicalize`.
 *   yaml — both sides parsed + normalized via @nekotools/lens-yaml, then
 *          compared as normalized YAML.
 *
 * `comparable` is false when a side could not be reduced to a comparable
 * form (e.g. a JSON/YAML parse failure). In that case `hunks` is empty and
 * the parse diagnostics carry the detail.
 */
export interface DiffResult {
  readonly mode: DiffMode;
  readonly leftLabel: string;
  readonly rightLabel: string;
  readonly hunks: readonly DiffHunk[];
  readonly summary: DiffSummary;
  readonly comparable: boolean;
}

export type DiffResultArtifact = Artifact<'diff.result', DiffResult>;
export type DiffArtifact = DiffResultArtifact;
