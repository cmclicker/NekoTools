import type { Artifact } from '@nekotools/contracts';

/**
 * NekoCron artifact kinds (namespaced under `cron.*`).
 *
 *   `cron.parsed` — a cron expression decoded into its expanded fields, a
 *                   human-readable description, and the next N run times
 *                   (computed in UTC from the injected clock so results are
 *                   deterministic and need no network/timezone database).
 */
export const CRON_KIND_PARSED = 'cron.parsed';

export const ALL_CRON_KINDS = [CRON_KIND_PARSED] as const;

export type CronKindTag = 'standard' | 'seconds' | 'special';

/** One expanded cron field. `raw` is the original token; `values` is the
 * sorted, de-duplicated set of matching integers. */
export interface CronField {
  readonly name: string;
  readonly raw: string;
  readonly values: readonly number[];
  readonly min: number;
  readonly max: number;
}

/** The parsed body of a `cron.parsed` artifact. */
export interface ParsedCron {
  readonly valid: boolean;
  /** Normalized expression (macros expanded, whitespace collapsed). */
  readonly expression: string;
  readonly kind: CronKindTag;
  /** Expanded fields in canonical order, or `null` when invalid. */
  readonly fields: readonly CronField[] | null;
  /** Human-readable description, e.g. "Every 15 minutes". */
  readonly description: string;
  /** Up to N next run times as ISO-8601 UTC strings. Empty for `@reboot`. */
  readonly nextRuns: readonly string[];
}

export type CronParsedArtifact = Artifact<'cron.parsed', ParsedCron>;
export type CronArtifact = CronParsedArtifact;

export const CRON_PARSED_EXPORT_KINDS = [CRON_KIND_PARSED] as const;
