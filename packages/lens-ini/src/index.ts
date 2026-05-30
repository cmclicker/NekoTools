import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createIniTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { iniManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Build a NekoINI registration for the runtime. Free exporters run for
 * everyone. The Pro exporters (INI→.env and INI→TOML conversion) are
 * registered as `proExporters` and gated by `runExporter` behind a valid
 * entitlement (single-build-gated model, same as NekoTOML / NekoNDJSON /
 * NekoCSV). The type-inference, semantic-diff, file-merge, and
 * workspace-snapshot Pro features remain advertising-only.
 */
export function buildIniRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: iniManifest,
    parsers: [createIniTextParser({ clock })],
    exporters: freeExporters,
    proExporters,
  };
}
