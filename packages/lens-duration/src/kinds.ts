import type { Artifact } from '@nekotools/contracts';

import type { ParsedDuration } from './duration.js';

/**
 * NekoDuration artifact kinds (namespaced under `duration.*`).
 *
 *   `duration.parsed` — one or more durations (one per input line) decoded
 *                       from ISO-8601 / humanized / bare-seconds forms into
 *                       total seconds, a normalized ISO form, a human form,
 *                       and d/h/m/s components. Pure arithmetic; no network.
 */
export const DURATION_KIND_PARSED = 'duration.parsed';

export const ALL_DURATION_KINDS = [DURATION_KIND_PARSED] as const;

export interface DurationEntry {
  readonly input: string;
  readonly valid: boolean;
  readonly value: ParsedDuration | null;
}

/** The parsed body of a `duration.parsed` artifact. */
export interface DurationReport {
  readonly count: number;
  readonly entries: readonly DurationEntry[];
}

export type DurationParsedArtifact = Artifact<'duration.parsed', DurationReport>;
export type DurationArtifact = DurationParsedArtifact;

export const DURATION_PARSED_EXPORT_KINDS = [DURATION_KIND_PARSED] as const;
