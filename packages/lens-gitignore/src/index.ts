import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createGitignoreTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { gitignoreManifest } from './manifest.js';

export * from './gitignore.js';
export * from './kinds.js';
export * from './diagnostics.js';
export * from './audit.js';
export * from './parser-text.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Build a NekoGitignore registration for the runtime. Free exporters run for
 * everyone; the Pro exporters (secret-coverage audit report, SARIF) are
 * registered as `proExporters` and gated by `runExporter` behind a valid
 * entitlement (single-build-gated model, same as NekoJWT / NekoCSP).
 */
export function buildGitignoreRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: gitignoreManifest,
    parsers: [createGitignoreTextParser({ clock })],
    exporters: freeExporters,
    proExporters,
  };
}
