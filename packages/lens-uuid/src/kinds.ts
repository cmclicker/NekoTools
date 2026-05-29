import type { Artifact } from '@nekotools/contracts';

/**
 * NekoUUID artifact kinds (namespaced under `uuid.*`).
 *
 *   `uuid.parsed` — one or more identifiers (one per input line) decoded
 *                   into kind (UUID / ULID), version + variant, the
 *                   canonical form, and any embedded timestamp. Pure
 *                   bit-math; no randomness, no clock dependency, no network.
 */
export const UUID_KIND_PARSED = 'uuid.parsed';

export const ALL_UUID_KINDS = [UUID_KIND_PARSED] as const;

export type IdKind = 'uuid' | 'ulid' | 'invalid';

/** One decoded identifier. */
export interface ParsedId {
  /** The original input line (trimmed). */
  readonly input: string;
  readonly kind: IdKind;
  readonly valid: boolean;
  /** UUID version 1–8, or `null` (ULID / invalid / nil / max). */
  readonly version: number | null;
  /** Human variant label (e.g. "RFC 4122"), or `null`. */
  readonly variant: string | null;
  /** Canonical form: lowercase dashed UUID / uppercase ULID, or `null`. */
  readonly normalized: string | null;
  /** Embedded timestamp as ISO-8601 UTC, when the version carries one. */
  readonly timestamp: string | null;
  readonly isNil: boolean;
  readonly isMax: boolean;
}

/** The parsed body of a `uuid.parsed` artifact. */
export interface UuidReport {
  readonly count: number;
  readonly ids: readonly ParsedId[];
}

export type UuidParsedArtifact = Artifact<'uuid.parsed', UuidReport>;
export type UuidArtifact = UuidParsedArtifact;

export const UUID_PARSED_EXPORT_KINDS = [UUID_KIND_PARSED] as const;
