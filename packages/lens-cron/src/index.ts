import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createCronTextParser } from './parser-text.js';
import { freeExporters } from './exporters.js';
import { cronManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/** Optional configuration for the NekoCron registration. */
export interface BuildCronRegistrationOptions {
  /** How many upcoming run times to compute. Defaults to 5. */
  readonly nextRunCount?: number;
}

/**
 * Build a NekoCron registration for the runtime. The free build passes
 * only the free parser and exporters; Pro ids declared in the manifest
 * (iCal, timezone report) are not registered here.
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
  };
}
