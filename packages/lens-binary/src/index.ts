import type { ToolRegistration } from '@nekotools/tool-runtime';

import { allExporters, proExporters } from './exporters.js';
import { binaryManifest } from './manifest.js';
import { createAllParsers } from './parsers.js';
import { FIXED_CLOCK, type Clock } from './util.js';

export * from './kinds.js';
export * from './parsers.js';
export * from './codegen.js';
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
 *
 * Free exporters run for everyone. The Pro exporters (byte map + batch report)
 * are registered as `proExporters` and gated by `runExporter` behind a valid
 * entitlement (single-build-gated model, same as NekoTOML / NekoJSON). The
 * remaining Pro features (batch-convert, magic-signature, endianness,
 * workspace snapshots) depend on future premium engines and are not registered
 * here.
 */
export function buildBinaryRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: binaryManifest,
    parsers: createAllParsers({ clock }),
    exporters: allExporters,
    proExporters,
  };
}
