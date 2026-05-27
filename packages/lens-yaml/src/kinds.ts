import type { Artifact } from '@nekotools/contracts';

/**
 * NekoYAML artifact kinds (all namespaced under `yaml.*`; none reused
 * from `json.*`).
 *
 *   `yaml.document`        — a parsed YAML stream: an ordered list of one
 *                            or more documents (multi-document `---`),
 *                            each carrying its JSON-safe data plus
 *                            anchor/alias metadata.
 *   `yaml.json-projection` — the safe YAML -> JSON projection of a
 *                            `yaml.document`, plus notes on constructs
 *                            that do not survive JSON (comments dropped,
 *                            anchors/aliases expanded). Derived in the
 *                            same parser run, so it cannot drift.
 */
export const YAML_KIND_DOCUMENT = 'yaml.document';
export const YAML_KIND_JSON_PROJECTION = 'yaml.json-projection';

export const ALL_YAML_KINDS = [YAML_KIND_DOCUMENT, YAML_KIND_JSON_PROJECTION] as const;

/** One parsed YAML document within a (possibly multi-document) stream. */
export interface YamlDocValue {
  /** JSON-safe parsed value of this document. */
  readonly data: unknown;
  readonly hasAnchors: boolean;
  readonly hasAliases: boolean;
  readonly anchorNames: readonly string[];
}

/** The parsed body of a `yaml.document` artifact. */
export interface YamlDocument {
  readonly documents: readonly YamlDocValue[];
  readonly multiDocument: boolean;
}

/** The safe YAML -> JSON projection of a `yaml.document`. */
export interface YamlJsonProjection {
  /** For a single-document stream, the document's data; for a
   * multi-document stream, an array of the documents' data. */
  readonly json: unknown;
  readonly multiDocument: boolean;
  /** Human-readable notes on lossy conversions (comments, anchors). */
  readonly lossyNotes: readonly string[];
}

export type YamlDocumentArtifact = Artifact<'yaml.document', YamlDocument>;
export type YamlJsonProjectionArtifact = Artifact<'yaml.json-projection', YamlJsonProjection>;
export type YamlArtifact = YamlDocumentArtifact | YamlJsonProjectionArtifact;

/** Exporters render `yaml.document`; narrow `accepts` per the NekoEnv
 * lesson (a wide accept list lets the runtime hand the wrong artifact to
 * the wrong exporter and emit empty output). */
export const YAML_DOCUMENT_EXPORT_KINDS = [YAML_KIND_DOCUMENT] as const;
