import type { ToolRegistration } from '@nekotools/tool-runtime';

import { createEnvDiffTextualParser } from './diff-textual.js';
import { createEnvKeyParser } from './parser-key.js';
import { createEnvTextParser } from './parser-text.js';
import { envManifest } from './manifest.js';
import { freeExporters } from './exporters.js';
import { FIXED_CLOCK, type Clock } from './util.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './canonical.js';
export * from './parser-text.js';
export * from './parser-key.js';
export * from './diff-textual.js';
export * from './schema-infer.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from './util.js';

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
 * The free build passes only the free parsers and exporters. Pro
 * implementations (TS / Zod / data-dictionary exports, semantic
 * diff, secrets scan, graph projector) live in a future private
 * package; the manifest itself is shared and declares the Pro ids as
 * advertising only.
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
  };
}
