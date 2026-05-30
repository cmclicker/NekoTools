import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createHeadersTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { headersManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './audit.js';
export * from './parser-text.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

export interface BuildHeadersRegistrationOptions {
  /** Soft byte threshold for `headers.large_document`. Defaults to 10 MB. */
  readonly largeDocumentBytes?: number;
}

/**
 * Build a NekoHeaders registration for the runtime. Free exporters run for
 * everyone; the Pro exporters (security audit report + SARIF) ship in the
 * binary as `proExporters`, gated by `runExporter` behind a valid entitlement.
 */
export function buildHeadersRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildHeadersRegistrationOptions = {},
): ToolRegistration {
  const deps =
    options.largeDocumentBytes !== undefined
      ? { clock, largeDocumentBytes: options.largeDocumentBytes }
      : { clock };
  return {
    manifest: headersManifest,
    parsers: [createHeadersTextParser(deps)],
    exporters: freeExporters,
    proExporters,
  };
}
