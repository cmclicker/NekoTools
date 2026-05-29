import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { csvManifest } from './manifest.js';
import { freeExporters } from './exporters.js';
import { createCsvTextParser } from './parser-text.js';

export * from './diagnostics.js';
export * from './kinds.js';
export * from './parser-text.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

export interface BuildCsvRegistrationOptions {
  readonly largeDocumentBytes?: number;
}

export function buildCsvRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildCsvRegistrationOptions = {},
): ToolRegistration {
  const deps =
    options.largeDocumentBytes !== undefined
      ? { clock, largeDocumentBytes: options.largeDocumentBytes }
      : { clock };
  return {
    manifest: csvManifest,
    parsers: [createCsvTextParser(deps)],
    exporters: freeExporters,
  };
}
