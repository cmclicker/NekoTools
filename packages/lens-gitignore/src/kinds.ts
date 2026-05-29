import type { Artifact } from '@nekotools/contracts';

import type { IgnoreRule, PathResult } from './gitignore.js';

/**
 * NekoGitignore artifact kinds (namespaced under `gitignore.*`).
 *
 *   `gitignore.parsed` — a .gitignore decoded into classified rules
 *                        (negation / anchor / dir-only / glob) plus, when
 *                        test paths are supplied, each path's ignored
 *                        verdict and the deciding rule. Pure glob matching;
 *                        no filesystem, no network.
 */
export const GITIGNORE_KIND_PARSED = 'gitignore.parsed';

export const ALL_GITIGNORE_KINDS = [GITIGNORE_KIND_PARSED] as const;

export type { IgnoreRule, PathResult } from './gitignore.js';

/** The parsed body of a `gitignore.parsed` artifact. */
export interface GitignoreReport {
  readonly rules: readonly IgnoreRule[];
  /** Count of actual pattern rules (excludes comments + blanks). */
  readonly patternCount: number;
  readonly commentCount: number;
  /** Path-test results when `hints.paths` were supplied; else empty. */
  readonly paths: readonly PathResult[];
}

export type GitignoreParsedArtifact = Artifact<'gitignore.parsed', GitignoreReport>;
export type GitignoreArtifact = GitignoreParsedArtifact;

export const GITIGNORE_PARSED_EXPORT_KINDS = [GITIGNORE_KIND_PARSED] as const;
