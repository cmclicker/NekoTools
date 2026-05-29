import type { ArtifactSource, Diagnostic } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { bytesToBase64, bytesToHex, utf8Encode } from './encoding.js';
import { HASH_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  HASH_KIND_DIGEST,
  isSupportedAlgorithm,
  type HashDigest,
  type HashDigestArtifact,
} from './kinds.js';

const TOOL_ID = 'hash';
/** Recorded as `producedBy.parserId` on digest artifacts. The digest step
 * is async (Web Crypto), so it is not a registered synchronous Parser —
 * but the artifact still records which operation produced it. */
const DIGESTER_ID = 'hash.digest';

export interface HashDigestDeps {
  readonly clock: Clock;
  /**
   * Injectable Web Crypto digester. Defaults to the global `crypto.subtle`,
   * which is present in browsers and in Node >= 20. It is injectable so UI
   * tests (jsdom) can supply a deterministic implementation instead of
   * depending on the test environment's crypto support.
   */
  readonly subtle?: Pick<SubtleCrypto, 'digest'>;
}

export interface DigestResult {
  readonly artifacts: readonly HashDigestArtifact[];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Compute a digest over raw bytes using Web Crypto. Async because
 * `crypto.subtle.digest` is async. Never throws for an unsupported
 * algorithm — it returns a `hash.unsupported_algorithm` diagnostic and no
 * artifact, mirroring how the parsers report malformed input.
 */
export async function digestBytes(
  algorithm: string,
  bytes: Uint8Array,
  deps: HashDigestDeps,
  source: ArtifactSource = { kind: 'paste', bytes: bytes.byteLength },
): Promise<DigestResult> {
  if (!isSupportedAlgorithm(algorithm)) {
    const diagIds = makeIdFactory('diag');
    return {
      artifacts: [],
      diagnostics: [
        makeDiagnostic(
          diagIds(),
          'error',
          HASH_DIAGNOSTIC_CODES.unsupportedAlgorithm,
          `unsupported algorithm "${algorithm}"; supported: SHA-256, SHA-384, SHA-512`,
        ),
      ],
    };
  }

  // `globalThis.crypto` is guaranteed in browsers and Node >= 20; the
  // optional chain is purely defensive so the engine reports via a
  // diagnostic instead of throwing in a host that somehow lacks it.
  const subtle = deps.subtle ?? globalThis.crypto?.subtle;
  if (subtle === undefined) {
    const diagIds = makeIdFactory('diag');
    return {
      artifacts: [],
      diagnostics: [
        makeDiagnostic(
          diagIds(),
          'error',
          HASH_DIAGNOSTIC_CODES.cryptoUnavailable,
          'Web Crypto (crypto.subtle) is unavailable in this environment',
        ),
      ],
    };
  }

  // Copy into a fresh ArrayBuffer-backed view. The input is typed
  // `Uint8Array<ArrayBufferLike>`, which TS's lib does not accept as a
  // `BufferSource` (it could in principle be SharedArrayBuffer-backed). The
  // copy is negligible next to the digest itself.
  const view = new Uint8Array(bytes);
  const buffer = await subtle.digest(algorithm, view);
  const digest = new Uint8Array(buffer);

  const value: HashDigest = {
    algorithm,
    hex: bytesToHex(digest),
    base64: bytesToBase64(digest),
    inputBytes: bytes.byteLength,
  };

  const artIds = makeIdFactory('art');
  const artifact: HashDigestArtifact = {
    version: 1,
    kind: HASH_KIND_DIGEST,
    id: artIds(),
    producedBy: { toolId: TOOL_ID, parserId: DIGESTER_ID, parserVersion: 1 },
    producedAt: deps.clock.now(),
    source,
    value,
  };
  return { artifacts: [artifact], diagnostics: [] };
}

/** Convenience wrapper: UTF-8 encode text, then call `digestBytes`. */
export async function digestText(
  algorithm: string,
  text: string,
  deps: HashDigestDeps,
  source?: ArtifactSource,
): Promise<DigestResult> {
  const bytes = utf8Encode(text);
  return digestBytes(
    algorithm,
    bytes,
    deps,
    source ?? { kind: 'paste', bytes: bytes.byteLength },
  );
}
