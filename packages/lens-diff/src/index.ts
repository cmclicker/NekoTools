import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { freeExporters, proExporters } from './exporters.js';
import { diffManifest } from './manifest.js';
import {
  createDiffJsonParser,
  createDiffTextParser,
  createDiffYamlParser,
} from './parsers.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './line-diff.js';
export * from './normalize.js';
export * from './parsers.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/** Optional configuration for the NekoDiff registration. */
export interface BuildDiffRegistrationOptions {
  /** Soft per-side byte threshold for `diff.large_input`. Defaults to 10 MB. */
  readonly largeInputBytes?: number;
}

/**
 * Build a NekoDiff registration for the runtime. Free exporters run for
 * everyone. The two Pro exporters (token/key-level semantic diff + signable
 * bundle) are registered as `proExporters` and gated by `runExporter` behind a
 * valid entitlement (single-build runtime-gated model). The ignore-order,
 * recipe, batch, and policy-drift Pro features remain advertising-only.
 */
export function buildDiffRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildDiffRegistrationOptions = {},
): ToolRegistration {
  const deps =
    options.largeInputBytes !== undefined
      ? { clock, largeInputBytes: options.largeInputBytes }
      : { clock };
  return {
    manifest: diffManifest,
    parsers: [
      createDiffTextParser(deps),
      createDiffJsonParser(deps),
      createDiffYamlParser(deps),
    ],
    exporters: freeExporters,
    proExporters,
  };
}
