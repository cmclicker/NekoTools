import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createUuidTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { uuidManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Build a NekoUUID registration for the runtime. Free exporters run for
 * everyone. The Pro exporters (namespace report + bulk CSV) are registered as
 * `proExporters` and gated by `runExporter` behind a valid entitlement
 * (single-build-gated model, same as NekoTOML / NekoJSON). Both derive purely
 * from the parsed ids — they describe what was pasted and never generate,
 * reverse a name hash, or extract a node MAC.
 */
export function buildUuidRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: uuidManifest,
    parsers: [createUuidTextParser({ clock })],
    exporters: freeExporters,
    proExporters,
  };
}
