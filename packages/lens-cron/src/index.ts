import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createCronTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { cronManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/** Optional configuration for the NekoCron registration. */
export interface BuildCronRegistrationOptions {
  /** How many upcoming run times to compute. Defaults to 5. */
  readonly nextRunCount?: number;
}

/**
 * Build a NekoCron registration for the runtime. Free exporters run for
 * everyone. The Pro exporters (iCal calendar of computed next runs +
 * cross-timezone report) are registered as `proExporters` and gated by
 * `runExporter` behind a valid entitlement (single-build-gated model, same as
 * NekoTOML / NekoJSON). Both derive purely from the already-computed UTC
 * `nextRuns` — no network, no re-scheduling. The remaining Pro features
 * (calendar scheduling, schedule compare/overlap, workspace snapshots) stay
 * advertising-only: they depend on future premium engines and are not
 * registered here.
 */
export function buildCronRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildCronRegistrationOptions = {},
): ToolRegistration {
  const deps =
    options.nextRunCount !== undefined ? { clock, nextRunCount: options.nextRunCount } : { clock };
  return {
    manifest: cronManifest,
    parsers: [createCronTextParser(deps)],
    exporters: freeExporters,
    proExporters,
  };
}
