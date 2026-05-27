import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createHeadersTextParser } from './parser-text.js';
import { freeExporters } from './exporters.js';
import { headersManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

export interface BuildHeadersRegistrationOptions {
  /** Soft byte threshold for `headers.large_document`. Defaults to 10 MB. */
  readonly largeDocumentBytes?: number;
}

/** Build a NekoHeaders registration for the runtime. Free parser +
 * exporters only; Pro ids declared in the manifest are not registered. */
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
  };
}
