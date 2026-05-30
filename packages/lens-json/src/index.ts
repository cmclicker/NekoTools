import type { ToolRegistration } from '@nekotools/tool-runtime';

import { createDiffTextualParser } from './diff-textual.js';
import { freeExporters, proExporters } from './exporters.js';
import { jsonManifest } from './manifest.js';
import { createJsonPointerParser } from './parser-pointer.js';
import { createJsonTextParser } from './parser-text.js';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './schema-infer.js';
export * from './paths.js';
export * from './parser-text.js';
export * from './parser-pointer.js';
export * from './diff-textual.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export * from './tokenizer.js';
export * from './walker-diagnostics.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Optional configuration for the NekoJSON registration. Defaults are
 * production-safe; tests pass overrides (small thresholds, fixed
 * clocks) to keep their inputs cheap and deterministic.
 */
export interface BuildJsonRegistrationOptions {
  /**
   * Soft size threshold in bytes for emitting `json.large_document`
   * from the `json.text` parser. Defaults to
   * `DEFAULT_LARGE_DOCUMENT_BYTES` (10 MB).
   */
  readonly largeDocumentBytes?: number;
}

/**
 * Build a NekoJSON registration for the runtime.
 *
 * Free exporters run for everyone; the Pro exporters (TypeScript types, Zod
 * schema, data dictionary) are registered as `proExporters` and gated by
 * `runExporter` behind a valid entitlement (single-build-gated model, same as
 * NekoJWT / NekoCSP). The remaining Pro entitlements (graph projection,
 * semantic diff, migration studio, advanced inference) depend on future
 * premium engines and are advertised in the manifest only.
 */
export function buildJsonRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildJsonRegistrationOptions = {},
): ToolRegistration {
  const textDeps =
    options.largeDocumentBytes !== undefined
      ? { clock, largeDocumentBytes: options.largeDocumentBytes }
      : { clock };
  return {
    manifest: jsonManifest,
    parsers: [
      createJsonTextParser(textDeps),
      createJsonPointerParser({ clock }),
      createDiffTextualParser({ clock }),
    ],
    exporters: freeExporters,
    proExporters,
  };
}
