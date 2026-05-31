import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createCodecTransformParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { codecManifest } from './manifest.js';

export * from './codecs.js';
export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/** Optional configuration for the NekoCodec registration. */
export interface BuildCodecRegistrationOptions {
  /** Soft byte threshold for emitting `codec.large_document`. Defaults to
   * `DEFAULT_LARGE_DOCUMENT_BYTES` (10 MB). */
  readonly largeDocumentBytes?: number;
}

/**
 * Build a NekoCodec registration for the runtime. Free exporters (transformed
 * text, JSON summary, Markdown summary) run for everyone; the Pro exporters
 * (batch report + reusable recipe bundle) are registered as `proExporters`
 * and gated by `runExporter` behind a valid entitlement (single-build-gated
 * model, same as NekoTOML / NekoJWT). They derive purely from the parsed
 * transform(s) — no signing, no remote, no premium engine.
 */
export function buildCodecRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildCodecRegistrationOptions = {},
): ToolRegistration {
  const deps =
    options.largeDocumentBytes !== undefined
      ? { clock, largeDocumentBytes: options.largeDocumentBytes }
      : { clock };
  return {
    manifest: codecManifest,
    parsers: [createCodecTransformParser(deps)],
    exporters: freeExporters,
    proExporters,
  };
}
