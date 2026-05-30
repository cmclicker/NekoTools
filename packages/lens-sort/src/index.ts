import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createSortTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { sortManifest } from './manifest.js';

export * from './sort.js';
export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Build a NekoSort registration for the runtime. Free exporters run for
 * everyone. ONE of the two declared Pro exporters — `sort.export.frequency`
 * — is registered as a `proExporter` and gated by `runExporter` behind a
 * valid entitlement (single-build-gated model, same as NekoDuration). The
 * other declared Pro id (`sort.export.diff`) needs the pre-transform input
 * the artifact doesn't retain, so it stays advertising-only — along with
 * sort-by-column/key, shuffle, and natural-sort.
 */
export function buildSortRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: sortManifest,
    parsers: [createSortTextParser({ clock })],
    exporters: freeExporters,
    proExporters,
  };
}
