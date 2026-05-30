import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createCaseTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { caseManifest } from './manifest.js';

export * from './case.js';
export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Build a NekoCase registration for the runtime. Free exporters run for
 * everyone. The Pro exporters (CSV grid of all forms + single-form pick) are
 * registered as `proExporters` and gated by `runExporter` behind a valid
 * entitlement (single-build-gated model, same as NekoColor / NekoHex). The
 * custom-acronym, Unicode-transliterate, and batch-rename Pro features remain
 * advertising-only — they depend on future premium engines.
 */
export function buildCaseRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: caseManifest,
    parsers: [createCaseTextParser({ clock })],
    exporters: freeExporters,
    proExporters,
  };
}
