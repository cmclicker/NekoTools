import type { Artifact } from '@nekotools/contracts';

/**
 * NekoHash artifact kinds (all namespaced under `hash.*`).
 *
 *   `hash.input`  — the validated, byte-measured input handed to the
 *                   hashing step. Produced synchronously by the
 *                   `hash.text` parser (input ingest is the only part of
 *                   hashing that fits the synchronous Parser contract).
 *   `hash.digest` — a computed digest: algorithm, hex + base64 encodings,
 *                   and the input byte length. Produced by the async
 *                   `digestBytes` function, which uses the Web Crypto
 *                   `crypto.subtle.digest` API (async — hence not a Parser).
 */
export const HASH_KIND_INPUT = 'hash.input';
export const HASH_KIND_DIGEST = 'hash.digest';

export const ALL_HASH_KINDS = [HASH_KIND_INPUT, HASH_KIND_DIGEST] as const;

/**
 * Algorithms NekoHash supports. These map 1:1 to Web Crypto digest
 * identifiers, so they are passed straight to `crypto.subtle.digest`.
 * Collision-prone legacy digests (MD5, SHA-1) are deliberately excluded.
 */
export type HashAlgorithm = 'SHA-256' | 'SHA-384' | 'SHA-512';

export const SUPPORTED_ALGORITHMS: readonly HashAlgorithm[] = ['SHA-256', 'SHA-384', 'SHA-512'];

export function isSupportedAlgorithm(value: string): value is HashAlgorithm {
  return (SUPPORTED_ALGORITHMS as readonly string[]).includes(value);
}

/** The body of a `hash.input` artifact. */
export interface HashInput {
  /** The raw input text (UTF-8). */
  readonly text: string;
  /** UTF-8 byte length of the input (what actually gets hashed). */
  readonly byteLength: number;
}

/** The body of a `hash.digest` artifact. */
export interface HashDigest {
  readonly algorithm: HashAlgorithm;
  /** Lowercase hex encoding of the digest. */
  readonly hex: string;
  /** Standard base64 encoding of the digest. */
  readonly base64: string;
  /** Number of input bytes that were hashed. */
  readonly inputBytes: number;
}

export type HashInputArtifact = Artifact<'hash.input', HashInput>;
export type HashDigestArtifact = Artifact<'hash.digest', HashDigest>;
export type HashArtifact = HashInputArtifact | HashDigestArtifact;

/** Exporters render `hash.digest`; narrowing `accepts` keeps the runtime
 * from handing a `hash.input` to a digest exporter and emitting nonsense. */
export const HASH_DIGEST_EXPORT_KINDS = [HASH_KIND_DIGEST] as const;
