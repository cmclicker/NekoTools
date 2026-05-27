import type { Artifact } from '@nekotools/contracts';

/**
 * NekoHeaders artifact kinds (namespaced under `headers.*`).
 *
 *   `headers.document` — a parsed HTTP header block: an ordered list of
 *                        `HeaderEntry` records plus an optional leading
 *                        request/status line.
 */
export const HEADERS_KIND_DOCUMENT = 'headers.document';

export const ALL_HEADERS_KINDS = [HEADERS_KIND_DOCUMENT] as const;

export interface HeaderEntry {
  /** Header name as written (original case preserved). */
  readonly name: string;
  /** Header value, trimmed. */
  readonly value: string;
  /** 1-indexed source line. */
  readonly line: number;
}

export interface HeadersDocument {
  readonly entries: readonly HeaderEntry[];
  /** A leading request line (`GET /x HTTP/1.1`) or status line
   * (`HTTP/1.1 200 OK`), if present; otherwise null. */
  readonly startLine: string | null;
}

export type HeadersDocumentArtifact = Artifact<'headers.document', HeadersDocument>;
export type HeadersArtifact = HeadersDocumentArtifact;

export const HEADERS_DOCUMENT_EXPORT_KINDS = [HEADERS_KIND_DOCUMENT] as const;
