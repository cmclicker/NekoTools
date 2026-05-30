import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createHexTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { hexManifest } from './manifest.js';

export * from './hex.js';
export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Build a NekoHex registration for the runtime. Free exporters run for
 * everyone. The Pro exporters (C array + base64 byte re-encodings) are
 * registered as `proExporters` and gated by `runExporter` behind a valid
 * entitlement (single-build-gated model, same as NekoINI / NekoTOML). The
 * byte-diff, byte-edit, pattern-search, and struct-decode Pro features remain
 * advertising-only — they need an interactive editor engine and are not
 * registered here.
 */
export function buildHexRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: hexManifest,
    parsers: [createHexTextParser({ clock })],
    exporters: freeExporters,
    proExporters,
  };
}
