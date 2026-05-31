import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createMimeTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { mimeManifest } from './manifest.js';

export * from './mime.js';
export * from './iana-data.js';
export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Build a NekoMIME registration for the runtime. Free exporters run for
 * everyone. The Pro exporters (IANA lookup + CSV) are registered as
 * `proExporters` and gated by `runExporter` behind a valid entitlement
 * (single-build-gated model, same as NekoTOML / NekoJSON). They each derive
 * purely from the parsed report plus the bundled IANA common-subset table; no
 * network, no premium-engine dependency. The magic-byte sniffing, charset
 * detection, Accept-header comparison, and workspace-snapshot Pro features
 * remain advertising-only — they depend on future premium engines and are not
 * registered here.
 */
export function buildMimeRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: mimeManifest,
    parsers: [createMimeTextParser({ clock })],
    exporters: freeExporters,
    proExporters,
  };
}
