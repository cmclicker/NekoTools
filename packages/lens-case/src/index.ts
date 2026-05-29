import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createCaseTextParser } from './parser-text.js';
import { freeExporters } from './exporters.js';
import { caseManifest } from './manifest.js';

export * from './case.js';
export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Build a NekoCase registration for the runtime. The free build passes only
 * the free parser and exporters; Pro ids declared in the manifest (CSV,
 * single-form) are not registered here.
 */
export function buildCaseRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: caseManifest,
    parsers: [createCaseTextParser({ clock })],
    exporters: freeExporters,
  };
}
