import type { Artifact } from '@nekotools/contracts';

/**
 * NekoSemver artifact kinds (namespaced under `semver.*`).
 *
 *   `semver.parsed` — one or more versions (one per input line) decoded
 *                     into components, plus the spec-precedence sort order
 *                     and, when a range is supplied, each version's
 *                     satisfies result. Pure comparison logic; no network.
 */
export const SEMVER_KIND_PARSED = 'semver.parsed';

export const ALL_SEMVER_KINDS = [SEMVER_KIND_PARSED] as const;

export interface SemverComponents {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** Dot-separated prerelease string (e.g. "alpha.1"), or `null`. */
  readonly prerelease: string | null;
  /** Build metadata (ignored for precedence), or `null`. */
  readonly build: string | null;
}

export interface ParsedVersion {
  readonly input: string;
  readonly valid: boolean;
  /** Normalized version (leading `v`/`=` stripped), or `null` if invalid. */
  readonly version: string | null;
  readonly components: SemverComponents | null;
  /** `true`/`false` when a range was supplied and the version is valid; else `null`. */
  readonly satisfies: boolean | null;
}

/** The parsed body of a `semver.parsed` artifact. */
export interface SemverReport {
  readonly count: number;
  /** The range the versions were tested against, or `null`. */
  readonly range: string | null;
  readonly versions: readonly ParsedVersion[];
  /** Valid versions in ascending precedence order (normalized strings). */
  readonly sortedAscending: readonly string[];
}

export type SemverParsedArtifact = Artifact<'semver.parsed', SemverReport>;
export type SemverArtifact = SemverParsedArtifact;

export const SEMVER_PARSED_EXPORT_KINDS = [SEMVER_KIND_PARSED] as const;
