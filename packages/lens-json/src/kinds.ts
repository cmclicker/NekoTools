import type { Artifact } from '@nekotools/contracts';

/**
 * NekoJSON artifact kinds (Phase 1 MVP).
 *
 * - `json.document`    : a parsed JSON value (any RFC 8259 type at the root).
 * - `json.path-result` : the value found at a JSON Pointer (RFC 6901).
 * - `json.schema`      : an inferred JSON Schema document.
 *
 * `json.diff` is declared in the charter but is deferred to a follow-up
 * PR — see docs/tools/nekojson.md "Deliberately undecided in Phase 1".
 */
export type JsonDocumentArtifact = Artifact<'json.document', unknown>;
export type JsonPathResultArtifact = Artifact<'json.path-result', JsonPathResult>;
export type JsonSchemaArtifact = Artifact<'json.schema', JsonSchemaValue>;

export type JsonArtifact = JsonDocumentArtifact | JsonPathResultArtifact | JsonSchemaArtifact;

export const JSON_KIND_DOCUMENT = 'json.document';
export const JSON_KIND_PATH_RESULT = 'json.path-result';
export const JSON_KIND_SCHEMA = 'json.schema';

export const FREE_JSON_KINDS = [
  JSON_KIND_DOCUMENT,
  JSON_KIND_PATH_RESULT,
  JSON_KIND_SCHEMA,
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
