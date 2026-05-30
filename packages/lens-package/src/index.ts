import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { freeExporters, proExporters } from './exporters.js';
import { packageManifest } from './manifest.js';
import { createPackageJsonParser } from './parser-text.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './audit.js';
export * from './parser-text.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

export interface BuildPackageRegistrationOptions {
  readonly largeDocumentBytes?: number;
}

export function buildPackageRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildPackageRegistrationOptions = {},
): ToolRegistration {
  const deps =
    options.largeDocumentBytes !== undefined
      ? { clock, largeDocumentBytes: options.largeDocumentBytes }
      : { clock };
  return {
    manifest: packageManifest,
    parsers: [createPackageJsonParser(deps)],
    exporters: freeExporters,
    proExporters,
  };
}
