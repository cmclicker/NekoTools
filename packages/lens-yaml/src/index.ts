import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createYamlFromJsonParser } from './parser-from-json.js';
import { createYamlTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { yamlManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './parser-from-json.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/** Optional configuration for the NekoYAML registration. */
export interface BuildYamlRegistrationOptions {
  /** Soft byte threshold for emitting `yaml.large_document`. Defaults to
   * `DEFAULT_LARGE_DOCUMENT_BYTES` (10 MB). */
  readonly largeDocumentBytes?: number;
}

/**
 * Build a NekoYAML registration for the runtime. Free exporters run for
 * everyone. The two engine-only Pro exporters (`yaml.export.schema.report`
 * — a structure report; `yaml.export.roundtrip.diff` — a round-trip
 * fidelity report) are registered as `proExporters` and gated by
 * `runExporter` behind a valid entitlement (single-build-gated model, same
 * as NekoTOML / NekoJSON). The remaining Pro features (policy packs,
 * redaction presets, batch validate, saved recipes, workspace snapshots,
 * anchor graph) depend on future premium engines and are not registered.
 */
export function buildYamlRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildYamlRegistrationOptions = {},
): ToolRegistration {
  const textDeps =
    options.largeDocumentBytes !== undefined
      ? { clock, largeDocumentBytes: options.largeDocumentBytes }
      : { clock };
  return {
    manifest: yamlManifest,
    parsers: [createYamlTextParser(textDeps), createYamlFromJsonParser({ clock })],
    exporters: freeExporters,
    proExporters,
  };
}
