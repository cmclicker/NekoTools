import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createPasswordTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { passwordManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './strength.js';
export * from './policy.js';
export * from './parser-text.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Build a NekoPassword registration for the runtime. Free exporters run for
 * everyone; the Pro exporters (policy-compliance report, audit CSV) ship in
 * the binary as `proExporters` and are gated by `runExporter` behind a valid
 * entitlement (single-build-gated model).
 */
export function buildPasswordRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: passwordManifest,
    parsers: [createPasswordTextParser({ clock })],
    exporters: freeExporters,
    proExporters,
  };
}
