import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createYamlFromJsonParser } from './parser-from-json.js';
import { createYamlTextParser } from './parser-text.js';
import { freeExporters } from './exporters.js';
import { yamlManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './parser-from-json.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/** Optional configuration for the NekoYAML registration. */
export interface BuildYamlRegistrationOptions {
  /** Soft byte threshold for emitting `yaml.large_document`. Defaults to
   * `DEFAULT_LARGE_DOCUMENT_BYTES` (10 MB). */
  readonly largeDocumentBytes?: number;
}

/**
 * Build a NekoYAML registration for the runtime. The free build passes
 * only the free parsers and exporters; Pro ids declared in the manifest
 * (schema report, roundtrip diff, anchor graph) are not registered here.
 */
export function buildYamlRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildYamlRegistrationOptions = {},
): ToolRegistration {
  const textDeps =
    options.largeDocumentBytes !== undefined
      ? { clock, largeDocumentBytes: options.largeDocumentBytes }
      : { clock };
  return {
    manifest: yamlManifest,
    parsers: [createYamlTextParser(textDeps), createYamlFromJsonParser({ clock })],
    exporters: freeExporters,
  };
}
