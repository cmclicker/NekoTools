import type { Artifact } from '@nekotools/contracts';

import type { CodepointInfo } from './unicode.js';

/**
 * NekoUnicode artifact kinds (namespaced under `unicode.*`).
 *
 *   `unicode.parsed` — a string broken into code points, each described
 *                      (hex, decimal, UTF-8/UTF-16 bytes, general category,
 *                      escape forms), plus summary counts. Pure analysis;
 *                      no Unicode name DB, no network.
 */
export const UNICODE_KIND_PARSED = 'unicode.parsed';

export const ALL_UNICODE_KINDS = [UNICODE_KIND_PARSED] as const;

export type { CodepointInfo } from './unicode.js';

/** The parsed body of a `unicode.parsed` artifact. */
export interface UnicodeReport {
  readonly codepointCount: number;
  readonly utf16UnitCount: number;
  readonly byteLength: number;
  readonly codepoints: readonly CodepointInfo[];
  readonly truncated: boolean;
}

export type UnicodeParsedArtifact = Artifact<'unicode.parsed', UnicodeReport>;
export type UnicodeArtifact = UnicodeParsedArtifact;

export const UNICODE_PARSED_EXPORT_KINDS = [UNICODE_KIND_PARSED] as const;
