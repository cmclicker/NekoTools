import type { Artifact } from '@nekotools/contracts';

/**
 * NekoRegex artifact kinds (namespaced under `regex.*`).
 *
 *   `regex.matchset` — the result of running one pattern (+ flags) over a
 *                      sample of text: validity, flag analysis, the match
 *                      list with numbered + named capture groups, and the
 *                      pattern's group metadata. A single parser run
 *                      produces exactly one of these (best-effort even for
 *                      an invalid pattern, so the UI never throws).
 */
export const REGEX_KIND_MATCHSET = 'regex.matchset';

export const ALL_REGEX_KINDS = [REGEX_KIND_MATCHSET] as const;

/** Exporters render `regex.matchset`; a narrow `accepts` list keeps the
 * runtime from handing the wrong artifact to an exporter. */
export const REGEX_MATCHSET_EXPORT_KINDS = [REGEX_KIND_MATCHSET] as const;

/** A single numbered capture group within a match. */
export interface RegexCaptureGroup {
  /** 1-based capture-group number. */
  readonly index: number;
  /** The group's name when it is a named group; otherwise null. */
  readonly name: string | null;
  /** The captured substring, or null when the group did not participate. */
  readonly value: string | null;
  /** Start offset of the capture (only with the `d` flag), else null. */
  readonly start: number | null;
  /** End offset of the capture (only with the `d` flag), else null. */
  readonly end: number | null;
}

/** One match of the pattern against the sample. */
export interface RegexMatch {
  /** 0-based position of this match within the result list. */
  readonly ordinal: number;
  /** The full matched substring (group 0). */
  readonly value: string;
  /** Start offset of the full match within the sample. */
  readonly start: number;
  /** End offset (exclusive) of the full match within the sample. */
  readonly end: number;
  /** Numbered capture groups, in pattern order. */
  readonly groups: readonly RegexCaptureGroup[];
  /** Named capture groups: name -> captured value (null when absent). */
  readonly namedGroups: Readonly<Record<string, string | null>>;
}

/** Parsed view of the flag string a user supplied. */
export interface RegexFlagInfo {
  /** The flag string exactly as given. */
  readonly raw: string;
  /** The de-duplicated, supported flags actually applied to the RegExp. */
  readonly applied: string;
  readonly global: boolean;
  readonly ignoreCase: boolean;
  readonly multiline: boolean;
  readonly dotAll: boolean;
  readonly unicode: boolean;
  readonly sticky: boolean;
  readonly hasIndices: boolean;
  /** Flag characters that are not valid native RegExp flags. */
  readonly unsupported: readonly string[];
}

/** The parsed body of a `regex.matchset` artifact. */
export interface RegexMatchSet {
  readonly pattern: string;
  readonly flags: RegexFlagInfo;
  /** True when the pattern (+ flags) compiled and the match ran. */
  readonly valid: boolean;
  /** The RegExp construction error message when `valid` is false, else null. */
  readonly error: string | null;
  readonly matchCount: number;
  readonly matches: readonly RegexMatch[];
  /** Number of capturing groups declared in the pattern. */
  readonly groupCount: number;
  /** Distinct named-group names declared in the pattern, in order. */
  readonly namedGroupNames: readonly string[];
  /** True when the match list was capped at the configured limit. */
  readonly truncated: boolean;
  /** UTF-8 byte length of the sample text. */
  readonly sampleBytes: number;
}

export type RegexMatchSetArtifact = Artifact<'regex.matchset', RegexMatchSet>;
export type RegexArtifact = RegexMatchSetArtifact;
