import type { Artifact, ArtifactSource } from './artifact.contract.js';
import type { Diagnostic } from './diagnostic.contract.js';
import type { ContractVersion } from './version.js';

/**
 * Parser — turns raw user input into one or more Artifacts.
 *
 * Parsers are pure functions of input + source. They never reach out to
 * the network, never read arbitrary files, never write state. A parser
 * may emit diagnostics alongside artifacts: a malformed input produces
 * diagnostics and (when possible) a best-effort partial artifact.
 */
export interface Parser<TArtifact extends Artifact = Artifact> {
  readonly version: ContractVersion;
  readonly id: string;
  readonly parserVersion: number;
  readonly toolId: string;
  readonly accepts: readonly string[];
  readonly produces: readonly TArtifact['kind'][];
  parse(input: ParserInput): ParserResult<TArtifact>;
}

export interface ParserInput {
  readonly raw: string;
  readonly source: ArtifactSource;
  readonly hints?: Readonly<Record<string, unknown>>;
}

export interface ParserResult<TArtifact extends Artifact = Artifact> {
  readonly artifacts: readonly TArtifact[];
  readonly diagnostics: readonly Diagnostic[];
}
