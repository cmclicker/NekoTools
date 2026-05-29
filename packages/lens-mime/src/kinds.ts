import type { Artifact } from '@nekotools/contracts';

import type { ParsedMimeValue } from './mime.js';

/**
 * NekoMIME artifact kinds (namespaced under `mime.*`).
 *
 *   `mime.parsed` — one or more MIME types / Content-Type strings / file
 *                   extensions (one per input line) decoded into essence,
 *                   suffix, registration tree, parameters, and known file
 *                   extensions. Pure string analysis; no content sniffing,
 *                   no network.
 */
export const MIME_KIND_PARSED = 'mime.parsed';

export const ALL_MIME_KINDS = [MIME_KIND_PARSED] as const;

export interface MimeEntry {
  readonly input: string;
  readonly valid: boolean;
  readonly value: ParsedMimeValue | null;
}

/** The parsed body of a `mime.parsed` artifact. */
export interface MimeReport {
  readonly count: number;
  readonly entries: readonly MimeEntry[];
}

export type MimeParsedArtifact = Artifact<'mime.parsed', MimeReport>;
export type MimeArtifact = MimeParsedArtifact;

export const MIME_PARSED_EXPORT_KINDS = [MIME_KIND_PARSED] as const;
