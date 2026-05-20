import type { Artifact } from '@nekotools/contracts';

/**
 * NekoJSON artifact kinds.
 *
 * - `json.document`    : a parsed JSON value (any RFC 8259 type at the root).
 * - `json.path-result` : the value found at a JSON Pointer (RFC 6901).
 * - `json.schema`      : an inferred JSON Schema document.
 * - `json.diff`        : a line-level textual diff between two documents.
 *                        Phase 1.1a ships the textual (free) variant; the
 *                        semantic (Pro) variant lives in a future private
 *                        package and is declared as advertising only.
 */
export type JsonDocumentArtifact = Artifact<'json.document', unknown>;
export type JsonPathResultArtifact = Artifact<'json.path-result', JsonPathResult>;
export type JsonSchemaArtifact = Artifact<'json.schema', JsonSchemaValue>;
export type JsonDiffArtifact = Artifact<'json.diff', JsonDiff>;

export type JsonArtifact =
  | JsonDocumentArtifact
  | JsonPathResultArtifact
  | JsonSchemaArtifact
  | JsonDiffArtifact;

export const JSON_KIND_DOCUMENT = 'json.document';
export const JSON_KIND_PATH_RESULT = 'json.path-result';
export const JSON_KIND_SCHEMA = 'json.schema';
export const JSON_KIND_DIFF = 'json.diff';

/**
 * Every NekoJSON artifact kind. Useful for "kind belongs to NekoJSON?"
 * checks. **Not** appropriate as an exporter's `accepts` list — that
 * must match what the exporter actually renders. See the
 * `JSON_*_EXPORT_KINDS` lists below for the per-exporter accepts.
 */
export const ALL_JSON_KINDS = [
  JSON_KIND_DOCUMENT,
  JSON_KIND_PATH_RESULT,
  JSON_KIND_SCHEMA,
  JSON_KIND_DIFF,
] as const;

/**
 * Per-exporter accept lists.
 *
 * The runtime's `runExporter` enforces `accepts.includes(artifact.kind)`
 * as a hard boundary. The Phase 1.0 MVP used one wide `FREE_JSON_KINDS`
 * list for the document exporters, but the PR #4 textual-diff audit
 * caught that this made `json.export.json.pretty` silently accept
 * `json.diff` artifacts and emit empty output — a bad contract.
 *
 * Each exporter now declares only the kinds it actually renders.
 */
export const JSON_DOCUMENT_EXPORT_KINDS = [JSON_KIND_DOCUMENT] as const;
export const JSON_DIFF_EXPORT_KINDS = [JSON_KIND_DIFF] as const;
/** Markdown summary explicitly handles every shipped artifact kind. */
export const JSON_SUMMARY_EXPORT_KINDS = [
  JSON_KIND_DOCUMENT,
  JSON_KIND_PATH_RESULT,
  JSON_KIND_SCHEMA,
  JSON_KIND_DIFF,
] as const;

/**
 * The result of resolving a JSON Pointer against a document. We
 * preserve the original pointer string for round-trip exports, and the
 * resolved value (or null if unresolved — diagnostics carry the
 * unresolved info).
 */
export interface JsonPathResult {
  readonly pointer: string;
  readonly documentArtifactId: string;
  readonly resolved: boolean;
  readonly value: unknown;
}

/**
 * A minimal subset of JSON Schema draft 2020-12 that the basic inferer
 * can produce. Advanced inference (oneOf, format detection, enum
 * collapse, etc.) is Pro and not in this PR.
 */
export interface JsonSchemaValue {
  readonly $schema?: string;
  readonly type?: JsonSchemaType | readonly JsonSchemaType[];
  readonly properties?: Readonly<Record<string, JsonSchemaValue>>;
  readonly required?: readonly string[];
  readonly items?: JsonSchemaValue;
  readonly additionalProperties?: boolean;
}

export type JsonSchemaType =
  | 'object'
  | 'array'
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'null';

/**
 * Phase 1.1a textual diff: a line-level diff between two `json.document`
 * artifacts. The diff is computed against a canonical pretty-printed form
 * (sorted keys, 2-space indent) so reordered keys do not produce noise.
 *
 * A "hunk" is a single line of output classified as equal / add / remove.
 * Line numbers are 1-indexed (display convention).
 *
 * The semantic diff (object/property-level, structural moves, type-aware)
 * is Pro and is declared in the manifest as advertising only.
 */
export interface JsonDiff {
  readonly leftArtifactId: string;
  readonly rightArtifactId: string;
  readonly hunks: readonly JsonDiffHunk[];
}

export type JsonDiffHunk =
  | { readonly kind: 'equal'; readonly text: string; readonly leftLine: number; readonly rightLine: number }
  | { readonly kind: 'add'; readonly text: string; readonly rightLine: number }
  | { readonly kind: 'remove'; readonly text: string; readonly leftLine: number };
