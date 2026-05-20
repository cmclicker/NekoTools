import type { Artifact } from './artifact.contract.js';
import type { Diagnostic } from './diagnostic.contract.js';
import type { ContractVersion } from './version.js';

/**
 * Export — serializes Artifacts (and optionally Diagnostics) to a target
 * format the user can save, paste, or share.
 *
 * Exports run locally. No HTTP. No upload. The output is a buffer or
 * string the user can drop into a file, gist, screenshot, or chat.
 */
export interface Exporter<TArtifact extends Artifact = Artifact> {
  readonly version: ContractVersion;
  readonly id: string;
  readonly toolId: string;
  readonly target: ExportTarget;
  readonly accepts: readonly TArtifact['kind'][];
  readonly producesMimeType: string;
  readonly producesExtension: string;
  export(input: ExportInput<TArtifact>): ExportResult;
}

export type ExportTarget = 'json' | 'markdown' | 'plaintext' | 'csv' | 'html' | 'binary';

export interface ExportInput<TArtifact extends Artifact = Artifact> {
  readonly artifacts: readonly TArtifact[];
  readonly diagnostics: readonly Diagnostic[];
  readonly options?: Readonly<Record<string, unknown>>;
}

export interface ExportResult {
  readonly mimeType: string;
  readonly extension: string;
  readonly body: string | Uint8Array;
  readonly diagnostics?: readonly Diagnostic[];
}
