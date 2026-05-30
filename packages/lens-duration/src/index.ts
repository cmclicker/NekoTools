import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createDurationTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { durationManifest } from './manifest.js';

export * from './duration.js';
export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Build a NekoDuration registration for the runtime. Free exporters run for
 * everyone. ONE of the two declared Pro exporters —
 * `duration.export.breakdown.csv` — is registered as a `proExporter` and
 * gated by `runExporter` behind a valid entitlement (single-build-gated
 * model, same as NekoCase / NekoColor). The other declared Pro id
 * (`duration.export.locale`) needs locale i18n data the manifest's
 * out-of-scope list excludes, so it stays advertising-only — along with
 * sum/diff/calendar-aware Pro features.
 */
export function buildDurationRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: durationManifest,
    parsers: [createDurationTextParser({ clock })],
    exporters: freeExporters,
    proExporters,
  };
}
