import type { Artifact } from '@nekotools/contracts';

import type { CodecName, CodecOperation } from './codecs.js';

/**
 * NekoCodec artifact kinds (namespaced under `codec.*`).
 *
 *   `codec.transform` — one encode/decode transform: the input text, the
 *                       chosen operation + codec, the transformed output
 *                       (or null when the input was invalid for a decode),
 *                       and size / binary-shape metadata. A transform is a
 *                       pure function of (operation, codec, input), so it
 *                       cannot drift between runs.
 */
export const CODEC_KIND_TRANSFORM = 'codec.transform';

export const ALL_CODEC_KINDS = [CODEC_KIND_TRANSFORM] as const;

/** The parsed body of a `codec.transform` artifact. */
export interface CodecTransform {
  readonly operation: CodecOperation;
  readonly codec: CodecName;
  /** The original input text. */
  readonly input: string;
  /** Transformed text, or null when a decode failed (see diagnostics). */
  readonly output: string | null;
  /** Whether the transform succeeded. */
  readonly ok: boolean;
  /** UTF-8 byte length of the input. */
  readonly inputBytes: number;
  /** UTF-8 byte length of the output (0 when output is null). */
  readonly outputBytes: number;
  /** Whether a decode produced bytes that look binary rather than text. */
  readonly looksBinary: boolean;
}

export type CodecTransformArtifact = Artifact<'codec.transform', CodecTransform>;
export type CodecArtifact = CodecTransformArtifact;

/** Exporters render `codec.transform`; the runtime enforces this accept
 * list so the wrong artifact never reaches the wrong exporter. */
export const CODEC_TRANSFORM_EXPORT_KINDS = [CODEC_KIND_TRANSFORM] as const;
