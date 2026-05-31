import type { HashAlgorithm, HashDigest } from './kinds.js';

/**
 * NekoHash Pro code generation. Backs the declared Pro exporters
 * `hash.export.manifest` (pro entitlement `manifest.batch`) and
 * `hash.export.checksum.profile` (pro entitlement `verify.profiles`).
 *
 * Both are pure, deterministic projections of digests that were ALREADY
 * computed by the async `digestBytes` engine and carried on `hash.digest`
 * artifacts (`{ algorithm, hex, base64, inputBytes }`). Nothing here calls
 * Web Crypto, re-encodes the input, or recomputes a hash — the synchronous
 * Exporter contract forbids the async digest step, so these only read the
 * `HashDigest` values handed to them. No network, no clock, no premium
 * engine. Stays strictly within scope: SHA-256/384/512 over the
 * already-parsed input — no HMAC, signatures, KDFs, encryption, or MD5/SHA-1.
 */

/** Placeholder name when an input carries no filename/label (stdin-style,
 * matching `sha256sum -`). The free build's input artifacts are paste/import
 * and carry no name, so this is the normal case. */
const DEFAULT_NAME = '-';

/**
 * `hash.export.manifest` — a checksum manifest in the conventional
 * `<hexdigest>  <name>` shell format (two spaces, as emitted by `sha256sum`
 * et al.), one line per computed digest. A pure projection of each digest's
 * already-computed `hex`. Digests are emitted in the order supplied so the
 * output is deterministic for a given artifact set.
 */
export function toChecksumManifest(
  digests: readonly HashDigest[],
  name: string = DEFAULT_NAME,
): string {
  return digests.map((d) => `${d.hex}  ${name}`).join('\n');
}

/** One algorithm's slice of a verification profile. */
export interface ChecksumProfileEntry {
  readonly algorithm: HashAlgorithm;
  readonly hex: string;
  readonly base64: string;
  readonly inputBytes: number;
}

/** A verification profile a user can keep and later compare against. */
export interface ChecksumProfile {
  readonly tool: 'NekoHash';
  /** Which algorithms were computed, in supply order (deduplicated). */
  readonly algorithms: readonly HashAlgorithm[];
  /** Per-algorithm hex + base64 + input byte length. */
  readonly digests: readonly ChecksumProfileEntry[];
}

/**
 * `hash.export.checksum.profile` — a structured verification profile
 * summarizing the already-computed digests: per algorithm the hex + base64 +
 * input byte length, plus the list of algorithms covered. Pure projection of
 * the `HashDigest` values; no recomputation.
 */
export function buildChecksumProfile(digests: readonly HashDigest[]): ChecksumProfile {
  const entries: ChecksumProfileEntry[] = digests.map((d) => ({
    algorithm: d.algorithm,
    hex: d.hex,
    base64: d.base64,
    inputBytes: d.inputBytes,
  }));
  const algorithms: HashAlgorithm[] = [];
  for (const d of digests) {
    if (!algorithms.includes(d.algorithm)) algorithms.push(d.algorithm);
  }
  return { tool: 'NekoHash', algorithms, digests: entries };
}

/** Render a {@link ChecksumProfile} as deterministic pretty JSON. */
export function renderChecksumProfileJson(profile: ChecksumProfile): string {
  return JSON.stringify(profile, null, 2);
}
