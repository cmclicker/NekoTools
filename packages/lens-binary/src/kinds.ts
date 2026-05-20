import type { Artifact } from '@nekotools/contracts';

/**
 * NekoBinary produces three artifact kinds:
 *
 *  - binary.number : a finite non-negative integer
 *  - binary.bytes  : a sequence of bytes (Uint8Array, serialized as
 *                    a hex string for the JSON-on-disk representation)
 *  - binary.text   : a UTF-8 string
 */
export type BinaryNumberArtifact = Artifact<'binary.number', number>;
export type BinaryBytesArtifact = Artifact<'binary.bytes', string>; // hex
export type BinaryTextArtifact = Artifact<'binary.text', string>;

export type BinaryArtifact =
  | BinaryNumberArtifact
  | BinaryBytesArtifact
  | BinaryTextArtifact;

export const BINARY_KIND_NUMBER = 'binary.number';
export const BINARY_KIND_BYTES = 'binary.bytes';
export const BINARY_KIND_TEXT = 'binary.text';

export const ALL_BINARY_KINDS = [
  BINARY_KIND_NUMBER,
  BINARY_KIND_BYTES,
  BINARY_KIND_TEXT,
] as const;
