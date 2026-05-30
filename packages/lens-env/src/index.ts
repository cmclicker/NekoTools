import type { ToolRegistration } from '@nekotools/tool-runtime';

import { createEnvDiffTextualParser } from './diff-textual.js';
import { createEnvKeyParser } from './parser-key.js';
import { createEnvTextParser } from './parser-text.js';
import { envManifest } from './manifest.js';
import { freeExporters, proExporters } from './exporters.js';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './canonical.js';
export * from './parser-text.js';
export * from './parser-key.js';
export * from './diff-textual.js';
export * from './schema-infer.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Optional configuration for the NekoEnv registration. Mirrors
 * NekoJSON's options shape — same knob, same default (10 MB).
 */
export interface BuildEnvRegistrationOptions {
  /**
   * Soft size threshold in bytes for emitting `env.large_document`
   * from the `env.text` parser. Defaults to
   * `DEFAULT_LARGE_DOCUMENT_BYTES` (10 MB).
   */
  readonly largeDocumentBytes?: number;
}

/**
 * Build a NekoEnv registration for the runtime.
 *
 * Free exporters run for everyone. The Pro exporters (typed ProcessEnv
 * interface, Zod env validator, cross-document data dictionary, and the
 * Docker Compose / k8s ConfigMap composite) are registered as
 * `proExporters` and gated by `runExporter` behind a valid entitlement
 * (single-build-gated model, same as NekoJSON / NekoHeaders). The
 * advanced-inference, secrets-scan, semantic-diff, and graph-projector
 * Pro features remain advertising-only — they depend on future premium
 * engines and are not registered here.
 */
export function buildEnvRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildEnvRegistrationOptions = {},
): ToolRegistration {
  const textDeps =
    options.largeDocumentBytes !== undefined
      ? { clock, largeDocumentBytes: options.largeDocumentBytes }
      : { clock };
  return {
    manifest: envManifest,
    parsers: [
      createEnvTextParser(textDeps),
      createEnvKeyParser({ clock }),
      createEnvDiffTextualParser({ clock }),
    ],
    exporters: freeExporters,
    proExporters,
  };
}
