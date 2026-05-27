import type { Artifact } from '@nekotools/contracts';

/**
 * NekoTime artifact kinds (all namespaced under `time.*`).
 *
 *   `time.instant` — a single resolved point in time. Carries the
 *                    canonical epoch-milliseconds value plus every
 *                    representation the free tier surfaces: ISO UTC,
 *                    Unix seconds / milliseconds, a local-time render
 *                    with timezone offset, and a relative age measured
 *                    from the injected clock's "now".
 *
 * One kind is enough: every free-tier output is a pure function of the
 * resolved instant, so there is nothing for the views to drift from.
 */
export const TIME_KIND_INSTANT = 'time.instant';

export const ALL_TIME_KINDS = [TIME_KIND_INSTANT] as const;

/** How the raw input was interpreted to reach the canonical epoch. */
export type TimeInterpretation =
  | 'unix-seconds'
  | 'unix-milliseconds'
  | 'iso-8601'
  | 'date-string';

/**
 * Local-time rendering of the instant, relative to the host runtime's
 * zone. This is deliberately environment-dependent — surfacing the
 * user's *local* wall-clock time is the whole point. `offsetMinutes` is
 * positive east of UTC (e.g. `-480` for UTC-8).
 */
export interface LocalTimeInfo {
  /** Locale-formatted (`en-US`, medium date + long time) local string. */
  readonly formatted: string;
  /** Minutes east of UTC at this instant (DST-aware). */
  readonly offsetMinutes: number;
  /** `±HH:MM` offset label (e.g. `-08:00`, `+05:30`, `+00:00`). */
  readonly offsetLabel: string;
  /** Host IANA zone name (e.g. `America/Los_Angeles`, `UTC`). */
  readonly timeZone: string;
}

/** Age of the instant relative to the runtime clock's "now". */
export interface RelativeAge {
  /** `now - instant`, in milliseconds. Positive = past, negative = future. */
  readonly deltaMs: number;
  readonly isFuture: boolean;
  /** Deterministic English label: `3 days ago` / `in 2 hours` / `just now`. */
  readonly label: string;
}

/** A single resolved point in time and all of its free-tier views. */
export interface TimeInstant {
  /** Canonical integer epoch milliseconds (UTC). */
  readonly epochMs: number;
  /** How the raw input was read to produce `epochMs`. */
  readonly interpretation: TimeInterpretation;
  /** ISO-8601 in UTC, e.g. `2023-11-14T22:13:20.000Z`. */
  readonly iso: string;
  /** Whole Unix seconds (floored toward negative infinity). */
  readonly epochSeconds: number;
  /** Unix milliseconds (identical to `epochMs`; surfaced for copy). */
  readonly epochMillis: number;
  readonly local: LocalTimeInfo;
  readonly relative: RelativeAge;
}

export type TimeInstantArtifact = Artifact<'time.instant', TimeInstant>;
export type TimeArtifact = TimeInstantArtifact;

/**
 * Exporters render `time.instant`; the accept list is narrowed to just
 * that kind (the NekoEnv / NekoYAML lesson: a wide accept list lets the
 * runtime hand the wrong artifact to an exporter and emit empty output).
 */
export const TIME_INSTANT_EXPORT_KINDS = [TIME_KIND_INSTANT] as const;
