import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createJwtTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { jwtManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './exporters.js';
export * from './audit.js';
export * from './verify.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/** Optional configuration for the NekoJWT registration. */
export interface BuildJwtRegistrationOptions {
  /** Soft byte threshold for emitting `jwt.large_document`. Defaults to
   * `DEFAULT_LARGE_DOCUMENT_BYTES` (10 MB). */
  readonly largeDocumentBytes?: number;
}

/**
 * Build a NekoJWT registration for the runtime. Free exporters run for
 * everyone; the Pro exporters (claims/security audit, SARIF) are registered
 * as `proExporters` and gated by `runExporter` behind a valid entitlement
 * (single-build-gated model). Offline signature verification is a separate
 * injectable engine fn (it needs a key, so it isn't an exporter).
 */
export function buildJwtRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildJwtRegistrationOptions = {},
): ToolRegistration {
  const textDeps =
    options.largeDocumentBytes !== undefined
      ? { clock, largeDocumentBytes: options.largeDocumentBytes }
      : { clock };
  return {
    manifest: jwtManifest,
    parsers: [createJwtTextParser(textDeps)],
    exporters: freeExporters,
    proExporters,
  };
}
