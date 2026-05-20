import type { ToolRegistration } from '@nekotools/tool-runtime';

import { allExporters } from './exporters.js';
import { binaryManifest } from './manifest.js';
import { createAllParsers } from './parsers.js';
import { FIXED_CLOCK, type Clock } from './util.js';

export * from './kinds.js';
export * from './parsers.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from './util.js';

/**
 * Build a NekoBinary registration. The runtime calls this and hands the
 * result to `ToolRegistry.register`.
 *
 * A clock is required because parsers stamp `producedAt` on every
 * artifact and we need that to be reproducible from tests, exports, and
 * workspace files. Defaults to a fixed epoch — the real app passes its
 * own clock.
 */
export function buildBinaryRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: binaryManifest,
    parsers: createAllParsers({ clock }),
    exporters: allExporters,
  };
}
