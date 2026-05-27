import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createHashTextParser } from './parser-text.js';
import { freeExporters } from './exporters.js';
import { hashManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './encoding.js';
export * from './digest.js';
export * from './parser-text.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/** Optional configuration for the NekoHash registration. */
export interface BuildHashRegistrationOptions {
  /** Soft byte threshold for emitting `hash.large_input`. Defaults to
   * `DEFAULT_LARGE_INPUT_BYTES` (10 MB). */
  readonly largeInputBytes?: number;
}

/**
 * Build a NekoHash registration for the runtime. The free build registers
 * only the synchronous `hash.text` ingest parser plus the free exporters;
 * the Pro exporter ids declared in the manifest are not registered here.
 * (The async digest step — `digestBytes` — is a direct engine function, not
 * a registered Parser, because Web Crypto's `digest` is asynchronous.)
 */
export function buildHashRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildHashRegistrationOptions = {},
): ToolRegistration {
  const deps =
    options.largeInputBytes !== undefined
      ? { clock, largeInputBytes: options.largeInputBytes }
      : { clock };
  return {
    manifest: hashManifest,
    parsers: [createHashTextParser(deps)],
    exporters: freeExporters,
  };
}
