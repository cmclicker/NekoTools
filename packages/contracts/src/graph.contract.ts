import type { Artifact } from './artifact.contract.js';
import type { ContractVersion } from './version.js';

/**
 * Graph — projects Artifacts into a node/edge view.
 *
 * Graphs are how tools visualize relationships: JSON references,
 * Docker Compose service links, env variable usage, package dependencies,
 * route maps, etc. The contract is the same shape across tools so the
 * UI can render any tool's graph with the same primitives.
 */
export interface GraphProjection {
  readonly version: ContractVersion;
  readonly id: string;
  readonly toolId: string;
  readonly fromArtifactIds: readonly string[];
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface GraphNode {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly artifactId?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface GraphEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: string;
  readonly label?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface GraphProjector<TArtifact extends Artifact = Artifact> {
  readonly version: ContractVersion;
  readonly id: string;
  readonly toolId: string;
  readonly accepts: readonly TArtifact['kind'][];
  project(artifacts: readonly TArtifact[]): GraphProjection;
}
