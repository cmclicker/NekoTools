import { ToolRegistry, runParser } from '@nekotools/tool-runtime';
import {
  buildEnvRegistration,
  FIXED_CLOCK,
  type EnvDiff,
  type EnvDiffArtifact,
  type EnvDocument,
  type EnvDocumentArtifact,
} from '@nekotools/lens-env';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoEnv UI parse helpers, extracted out of EnvApp for testability.
 * Two reasons this lives here:
 *
 *   1. PR #14 audit blocker 2: `source.bytes` must be the UTF-8 byte
 *      length, not `raw.length` (which counts JS UTF-16 code units
 *      and under-counts non-ASCII payloads). The same class of bug
 *      was caught for lens-json in PR #5 and for the lens-env parser
 *      threshold in Phase 2.1. The UI must not reintroduce it.
 *   2. The shared registry needs to be a singleton, so the parser
 *      identity (and its FIXED_CLOCK timestamp) is stable across
 *      App re-renders.
 */

const SHARED_UTF8_ENCODER = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildEnvRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedEnv {
  readonly hasDocument: boolean;
  readonly artifact: EnvDocumentArtifact | null;
  readonly document: EnvDocument | null;
  readonly diagnostics: readonly Diagnostic[];
  /** UTF-8 byte length of the raw input (recorded into source.bytes). */
  readonly inputBytes: number;
}

export function parseEnvText(raw: string): ParsedEnv {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'env', 'env.text', {
    raw,
    source: { kind: 'paste', bytes },
  });
  const artifact = (result.artifacts[0] as EnvDocumentArtifact | undefined) ?? null;
  return {
    hasDocument: artifact !== null,
    artifact,
    document: artifact?.value ?? null,
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}

export function computeEnvDiff(
  left: EnvDocumentArtifact | null,
  right: EnvDocumentArtifact | null,
): EnvDiff | null {
  if (!left || !right) return null;
  const result = runParser(registry, 'env', 'env.diff.textual', {
    raw: '',
    source: { kind: 'derived', from: [left.id, right.id] },
    hints: {
      leftArtifactId: left.id,
      leftDocument: left.value,
      rightArtifactId: right.id,
      rightDocument: right.value,
    },
  });
  const artifact = result.artifacts[0] as EnvDiffArtifact | undefined;
  return artifact?.value ?? null;
}
