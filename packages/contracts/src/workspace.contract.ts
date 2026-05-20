import type { Artifact } from './artifact.contract.js';
import type { Diagnostic } from './diagnostic.contract.js';
import type { ContractVersion } from './version.js';

/**
 * Workspace — the durable, on-disk representation of a tool session.
 *
 * A workspace bundles the artifacts a user has loaded, the diagnostics
 * the runtime produced, and the UI state of the tool that produced
 * them. Saving and loading a workspace must round-trip losslessly.
 *
 * Workspaces are user-owned files. They are not synced. They are not
 * uploaded. They are the unit of "share what I'm seeing" — a user
 * exports a workspace file and hands it to a teammate over whatever
 * channel they prefer.
 */
export interface Workspace {
  readonly version: ContractVersion;
  readonly id: string;
  readonly toolId: string;
  readonly toolVersion: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly artifacts: readonly Artifact[];
  readonly diagnostics: readonly Diagnostic[];
  readonly uiState?: Readonly<Record<string, unknown>>;
  readonly notes?: string;
}

export interface WorkspaceSerializer {
  readonly version: ContractVersion;
  serialize(workspace: Workspace): string;
  deserialize(raw: string): Workspace;
}
