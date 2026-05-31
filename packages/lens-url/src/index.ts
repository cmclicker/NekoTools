import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createUrlTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { urlManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './encode.js';
export * from './parser-text.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/** Optional configuration for the NekoURL registration. */
export interface BuildUrlRegistrationOptions {
  /** Soft byte threshold for emitting `url.long_query`. Defaults to
   * `DEFAULT_LONG_QUERY_BYTES` (512 bytes). */
  readonly longQueryBytes?: number;
}

/**
 * Build a NekoURL registration for the runtime. Free exporters run for
 * everyone. The Pro exporters (batch security/hygiene audit + declarative
 * redaction preset) are registered as `proExporters` and gated by
 * `runExporter` behind a valid entitlement (single-build-gated model, same
 * as NekoTOML / NekoJSON). Both derive purely from already-parsed
 * components — they never resolve, follow redirects, or fetch. The
 * remaining advertised Pro features (signed-link profile, redirect-chain
 * inspection, normalization recipes, policy packs, workspace snapshots)
 * depend on future premium engines and are not registered here.
 */
export function buildUrlRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildUrlRegistrationOptions = {},
): ToolRegistration {
  const deps =
    options.longQueryBytes !== undefined
      ? { clock, longQueryBytes: options.longQueryBytes }
      : { clock };
  return {
    manifest: urlManifest,
    parsers: [createUrlTextParser(deps)],
    exporters: freeExporters,
    proExporters,
  };
}
