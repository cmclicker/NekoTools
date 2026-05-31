import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createSemverTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { semverManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './semver.js';
export * from './parser-text.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Build a NekoSemver registration for the runtime. Free exporters run for
 * everyone. The Pro exporters (range report + bump plan) are registered as
 * `proExporters` and gated by `runExporter` behind a valid entitlement
 * (single-build-gated model, same as NekoTOML / NekoJSON). Both derive purely
 * from the already-parsed report — no registry lookup, no commit history.
 */
export function buildSemverRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: semverManifest,
    parsers: [createSemverTextParser({ clock })],
    exporters: freeExporters,
    proExporters,
  };
}
