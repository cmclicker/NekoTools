import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createNdjsonTextParser } from './parser-text.js';
import { freeExporters } from './exporters.js';
import { ndjsonManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Build a NekoNDJSON registration for the runtime. The free build passes
 * only the free parser and exporters; Pro ids declared in the manifest
 * (schema inference, CSV flatten) are not registered here.
 */
export function buildNdjsonRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: ndjsonManifest,
    parsers: [createNdjsonTextParser({ clock })],
    exporters: freeExporters,
  };
}
