import type { ContractVersion } from './version.js';

/**
 * Artifact — the keystone of NekoTools.
 *
 * Every tool in the suite produces, annotates, projects, exports, and
 * persists Artifacts. Parser, Diagnostic, Export, Graph, and Workspace
 * contracts all reference this shape.
 *
 * An Artifact is the local, in-memory representation of a piece of
 * technical content a user has handed to a tool: a parsed number, an
 * env file, a YAML manifest, a header set, a JSON document, etc.
 *
 * Artifacts are content-addressed by `id` within a workspace.
 */
export interface Artifact<TKind extends string = string, TValue = unknown> {
  readonly version: ContractVersion;
  readonly kind: TKind;
  readonly id: string;
  readonly producedBy: ProducerRef;
  readonly producedAt: string;
  readonly source: ArtifactSource;
  readonly value: TValue;
  readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * Records which tool + parser produced an artifact. Useful for diagnostics
 * and for the workspace replay log.
 */
export interface ProducerRef {
  readonly toolId: string;
  readonly parserId: string;
  readonly parserVersion: number;
}

/**
 * Where the raw input came from. NekoTools never auto-fetches —
 * everything is paste/import/file. The source records that fact.
 */
export type ArtifactSource =
  | { readonly kind: 'paste'; readonly bytes: number }
  | { readonly kind: 'file'; readonly bytes: number; readonly filename?: string }
  | { readonly kind: 'import'; readonly bytes: number; readonly format: string }
  | { readonly kind: 'derived'; readonly from: readonly string[] };

/**
 * A registered artifact kind. Tools declare the kinds they produce in
 * their manifest. The runtime uses this for routing exports, diagnostics,
 * and graph projections.
 */
export interface ArtifactKindDescriptor {
  readonly version: ContractVersion;
  readonly kind: string;
  readonly displayName: string;
  readonly summary: string;
}

export function isArtifact(value: unknown): value is Artifact {
  if (typeof value !== 'object' || value === null) return false;
  const a = value as Partial<Artifact>;
  return (
    typeof a.version === 'number' &&
    typeof a.kind === 'string' &&
    typeof a.id === 'string' &&
    typeof a.producedAt === 'string' &&
    typeof a.producedBy === 'object' &&
    a.producedBy !== null &&
    typeof a.source === 'object' &&
    a.source !== null
  );
}
