import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createSecretTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { secretsManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './rules.js';
export * from './parser-text.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/** Optional configuration for the NekoSecrets registration. */
export interface BuildSecretsRegistrationOptions {
  readonly entropyThreshold?: number;
  readonly entropyMinLength?: number;
}

/**
 * Build a NekoSecrets registration for the runtime. Free exporters run for
 * everyone; the Pro exporters (SARIF, source redaction) are registered as
 * `proExporters` and gated by `runExporter` behind a valid entitlement.
 */
export function buildSecretsRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildSecretsRegistrationOptions = {},
): ToolRegistration {
  const deps: { clock: Clock; entropyThreshold?: number; entropyMinLength?: number } = { clock };
  if (options.entropyThreshold !== undefined) deps.entropyThreshold = options.entropyThreshold;
  if (options.entropyMinLength !== undefined) deps.entropyMinLength = options.entropyMinLength;
  return {
    manifest: secretsManifest,
    parsers: [createSecretTextParser(deps)],
    exporters: freeExporters,
    // Single-build gated: Pro exporters ship here but only run with a valid
    // entitlement (runExporter enforces it).
    proExporters,
  };
}
