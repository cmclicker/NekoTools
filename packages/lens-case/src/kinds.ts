import type { Artifact } from '@nekotools/contracts';

import type { CaseFormId } from './case.js';

/**
 * NekoCase artifact kinds (namespaced under `case.*`).
 *
 *   `case.parsed` — one or more lines, each tokenized into words and
 *                   rendered in every supported case form (camel, snake,
 *                   kebab, …). Pure string transforms; no network.
 */
export const CASE_KIND_PARSED = 'case.parsed';

export const ALL_CASE_KINDS = [CASE_KIND_PARSED] as const;

export interface CaseEntry {
  readonly input: string;
  readonly words: readonly string[];
  readonly forms: Readonly<Record<CaseFormId, string>>;
}

/** The parsed body of a `case.parsed` artifact. */
export interface CaseReport {
  readonly count: number;
  readonly entries: readonly CaseEntry[];
}

export type CaseParsedArtifact = Artifact<'case.parsed', CaseReport>;
export type CaseArtifact = CaseParsedArtifact;

export const CASE_PARSED_EXPORT_KINDS = [CASE_KIND_PARSED] as const;
