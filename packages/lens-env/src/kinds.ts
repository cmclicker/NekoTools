import type { Artifact } from '@nekotools/contracts';

/**
 * NekoEnv artifact kinds.
 *
 *   `env.document`    — a parsed dotenv document. Preserves entry
 *                       order, comments, and blank lines so that the
 *                       canonical re-emit exporter can rebuild
 *                       documentation-shaped files faithfully.
 *   `env.key-result`  — the resolved entry (or absence) at a
 *                       user-supplied key. Parallel to NekoJSON's
 *                       `json.path-result`.
 *   `env.schema`      — an inferred schema describing per-key value
 *                       shape and required-ness. Basic inference only;
 *                       advanced inference is Pro.
 *   `env.diff`        — a line-level textual diff between two
 *                       `env.document` artifacts taken against a
 *                       canonical re-emit form (so insignificant
 *                       quoting / ordering differences do not
 *                       produce noise).
 */
export type EnvDocumentArtifact = Artifact<'env.document', EnvDocument>;
export type EnvKeyResultArtifact = Artifact<'env.key-result', EnvKeyResult>;
export type EnvSchemaArtifact = Artifact<'env.schema', EnvSchemaValue>;
export type EnvDiffArtifact = Artifact<'env.diff', EnvDiff>;

export type EnvArtifact =
  | EnvDocumentArtifact
  | EnvKeyResultArtifact
  | EnvSchemaArtifact
  | EnvDiffArtifact;

export const ENV_KIND_DOCUMENT = 'env.document';
export const ENV_KIND_KEY_RESULT = 'env.key-result';
export const ENV_KIND_SCHEMA = 'env.schema';
export const ENV_KIND_DIFF = 'env.diff';

export const ALL_ENV_KINDS = [
  ENV_KIND_DOCUMENT,
  ENV_KIND_KEY_RESULT,
  ENV_KIND_SCHEMA,
  ENV_KIND_DIFF,
] as const;

/**
 * Per-exporter accept lists. Each exporter declares only the kinds it
 * actually renders, matching the post-PR #4 rule in NekoJSON: a wide
 * `accepts` list lets the runtime quietly hand the wrong artifact to
 * the wrong exporter and emit empty output.
 */
export const ENV_DOCUMENT_EXPORT_KINDS = [ENV_KIND_DOCUMENT] as const;
export const ENV_DIFF_EXPORT_KINDS = [ENV_KIND_DIFF] as const;
export const ENV_SUMMARY_EXPORT_KINDS = [
  ENV_KIND_DOCUMENT,
  ENV_KIND_KEY_RESULT,
  ENV_KIND_SCHEMA,
  ENV_KIND_DIFF,
] as const;

/**
 * A single dotenv entry. `value` is the **decoded** value: for
 * double-quoted entries the standard `\n` / `\r` / `\t` / `\"` / `\\`
 * escapes are resolved; for single-quoted entries the body is taken
 * literally with no escape processing; for unquoted entries leading
 * and trailing horizontal whitespace is trimmed and a trailing `#
 * comment` is split off into `trailingComment`.
 *
 * `quoting` is the original wrapper so the canonical exporter can
 * decide how to re-emit, and so a future audit can tell from the
 * artifact alone whether escapes were processed.
 */
export interface EnvEntry {
  readonly key: string;
  readonly value: string;
  readonly quoting: 'none' | 'single' | 'double';
  /** Whether the source line had a leading `export ` shell prefix. */
  readonly exportPrefix: boolean;
  /** Inline `# comment` on the same source line, sans leading `#`. */
  readonly trailingComment?: string;
  /** 1-indexed line in the source where the entry starts. */
  readonly startLine: number;
  /** 1-indexed line where the entry ends. Same as start for single-line. */
  readonly endLine: number;
}

/** Preserved-shape line records — including blank lines and comments. */
export type EnvLine =
  | { readonly kind: 'blank'; readonly line: number }
  | { readonly kind: 'comment'; readonly text: string; readonly line: number }
  | { readonly kind: 'entry'; readonly entryIndex: number; readonly line: number; readonly endLine: number }
  | { readonly kind: 'malformed'; readonly text: string; readonly line: number };

/**
 * The parsed body of an `env.document` artifact. `entries` is the flat
 * ordered list of every key=value occurrence (including duplicates);
 * `lines` preserves the full document shape so canonical re-emit and
 * `.env.example`-skeleton export can reconstruct the file.
 */
export interface EnvDocument {
  readonly entries: readonly EnvEntry[];
  readonly lines: readonly EnvLine[];
}

/**
 * Resolved-key result. `present: false` means the document does not
 * contain the requested key; the parser surfaces an
 * `env.key.not_found` diagnostic alongside this artifact rather than
 * throwing.
 */
export type EnvKeyResult =
  | {
      readonly key: string;
      readonly documentArtifactId: string;
      readonly present: true;
      readonly entry: EnvEntry;
    }
  | {
      readonly key: string;
      readonly documentArtifactId: string;
      readonly present: false;
    };

/**
 * Inferred per-document schema. `properties` maps each key to its
 * inferred value-shape; `required` lists keys present in this
 * document. Advanced inference (enum collapse, format detection
 * beyond URL, cross-document unification) is Pro.
 */
export interface EnvSchemaValue {
  readonly $schema?: string;
  readonly type: 'object';
  readonly properties: Readonly<Record<string, EnvSchemaProperty>>;
  readonly required: readonly string[];
  readonly additionalProperties: boolean;
}

export type EnvValueShape =
  | 'boolean'
  | 'integer'
  | 'decimal'
  | 'url'
  | 'empty'
  | 'string';

/**
 * Per-property JSON-Schema-compatible value-shape description.
 * `type` is always `string` (dotenv values are strings on the wire);
 * `shape` carries the basic inferred categorisation. `format: 'uri'`
 * is emitted for `shape: 'url'` so the inferred schema is also a
 * useful JSON Schema for downstream tooling.
 */
export interface EnvSchemaProperty {
  readonly type: 'string';
  readonly shape: EnvValueShape;
  readonly format?: 'uri';
}

/**
 * Line-level textual diff between two dotenv documents. Computed
 * against the canonical re-emit of each document (sorted by key,
 * double-quoted), so reordered keys and insignificant quoting
 * differences do not produce noise. Semantic / key-level diffing is
 * Pro.
 */
export interface EnvDiff {
  readonly leftArtifactId: string;
  readonly rightArtifactId: string;
  readonly hunks: readonly EnvDiffHunk[];
}

export type EnvDiffHunk =
  | { readonly kind: 'equal'; readonly text: string; readonly leftLine: number; readonly rightLine: number }
  | { readonly kind: 'add'; readonly text: string; readonly rightLine: number }
  | { readonly kind: 'remove'; readonly text: string; readonly leftLine: number };
