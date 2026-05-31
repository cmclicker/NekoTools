import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createRegexMatchParser } from './parser-text.js';
import { createRegexSuiteParser } from './parser-suite.js';
import { freeExporters, proExporters } from './exporters.js';
import { regexManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './matcher.js';
export * from './parser-text.js';
export * from './parser-suite.js';
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
 * everyone. All FOUR declared Pro exporters are registered as `proExporters`
 * and gated by `runExporter` behind a valid entitlement (single-build-gated
 * model, same as NekoXML / NekoINI):
 *
 *   - `regex.export.explain` / `regex.export.redaction.recipe` render a
 *     single-run `regex.matchset` (from the `regex.match` parser).
 *   - `regex.export.suite` / `regex.export.snapshot` render a multi-case
 *     `regex.suite` (from the `regex.suite` parser). The suite is pasted in
 *     via the `cases` hint — nothing is persisted, since
 *     `capabilities.canSaveWorkspace` is false.
 */
export function buildRegexRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildRegexRegistrationOptions = {},
): ToolRegistration {
  const deps =
    options.maxMatches !== undefined ? { clock, maxMatches: options.maxMatches } : { clock };
  return {
    manifest: regexManifest,
    parsers: [createRegexMatchParser(deps), createRegexSuiteParser(deps)],
    exporters: freeExporters,
    proExporters,
  };
}
