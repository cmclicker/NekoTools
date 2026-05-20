import type { ToolRegistration } from '@nekotools/tool-runtime';

import { freeExporters } from './exporters.js';
import { jsonManifest } from './manifest.js';
import { createJsonPointerParser } from './parser-pointer.js';
import { createJsonTextParser } from './parser-text.js';
import { FIXED_CLOCK, type Clock } from './util.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './schema-infer.js';
export * from './paths.js';
export * from './parser-text.js';
export * from './parser-pointer.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from './util.js';

/**
 * Build a NekoJSON registration for the runtime.
 *
 * The free build passes only the free parsers and exporters. Pro
 * implementations live in a private package and are added by a Pro
 * build's registration call; the manifest itself is shared.
 */
export function buildJsonRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: jsonManifest,
    parsers: [createJsonTextParser({ clock }), createJsonPointerParser({ clock })],
    exporters: freeExporters,
  };
}
