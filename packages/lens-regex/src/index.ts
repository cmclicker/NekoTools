import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createRegexMatchParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { regexManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './matcher.js';
export * from './parser-text.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/** Optional configuration for the NekoRegex registration. */
export interface BuildRegexRegistrationOptions {
  /** Cap on matches collected for a global pattern. Defaults to 10,000. */
  readonly maxMatches?: number;
}

/**
 * Build a NekoRegex registration for the runtime. Free exporters run for
 * everyone. Two of the four declared Pro exporters — `regex.export.explain`
 * and `regex.export.redaction.recipe` — are registered as `proExporters` and
 * gated by `runExporter` behind a valid entitlement (single-build-gated
 * model, same as NekoXML / NekoINI). The other two declared Pro ids
 * (`regex.export.suite`, `regex.export.snapshot`) need saved multi-case
 * suites / regression baselines and stay advertising-only — `canSaveWorkspace`
 * is false and a matchset is a single test run.
 */
export function buildRegexRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildRegexRegistrationOptions = {},
): ToolRegistration {
  const deps =
    options.maxMatches !== undefined ? { clock, maxMatches: options.maxMatches } : { clock };
  return {
    manifest: regexManifest,
    parsers: [createRegexMatchParser(deps)],
    exporters: freeExporters,
    proExporters,
  };
}
