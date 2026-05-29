import type { Artifact } from '@nekotools/contracts';

import type { DumpRow } from './hex.js';

/**
 * NekoHex artifact kinds (namespaced under `hex.*`).
 *
 *   `hex.parsed` — a byte view of the input (treated as UTF-8 text or
 *                  decoded from a hex string) rendered as an offset / hex /
 *                  ASCII dump, plus the continuous hex string and byte
 *                  count. Pure byte math; no network.
 */
export const HEX_KIND_PARSED = 'hex.parsed';

export const ALL_HEX_KINDS = [HEX_KIND_PARSED] as const;

export type HexMode = 'text' | 'hex';

/** The parsed body of a `hex.parsed` artifact. */
export interface HexReport {
  readonly mode: HexMode;
  readonly valid: boolean;
  readonly byteLength: number;
  /** Continuous uppercase hex string of the bytes. */
  readonly hex: string;
  /** Printable-ASCII rendering of the bytes ('.' for non-printable). */
  readonly ascii: string;
  readonly rows: readonly DumpRow[];
}

export type HexParsedArtifact = Artifact<'hex.parsed', HexReport>;
export type HexArtifact = HexParsedArtifact;

export const HEX_PARSED_EXPORT_KINDS = [HEX_KIND_PARSED] as const;
