import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createRegexMatchParser } from './parser-text.js';
import { freeExporters } from './exporters.js';
import { regexManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './matcher.js';
export * from './parser-text.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/** Optional configuration for the NekoRegex registration. */
export interface BuildRegexRegistrationOptions {
  /** Cap on matches collected for a global pattern. Defaults to 10,000. */
  readonly maxMatches?: number;
}

/**
 * Build a NekoRegex registration for the runtime. The free build passes
 * only the free `regex.match` parser and the three free exporters; the Pro
 * exporter ids declared in the manifest (explain, redaction recipe, suite,
 * snapshot) are not registered here.
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
  };
}
