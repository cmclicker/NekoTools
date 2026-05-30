import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createXmlTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { xmlManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Build a NekoXML registration for the runtime. Free exporters run for
 * everyone. The Pro exporters (structural path inventory + inferred XSD) are
 * registered as `proExporters` and gated by `runExporter` behind a valid
 * entitlement (single-build-gated model, same as NekoTOML / NekoCSV /
 * NekoINI). XPath query *evaluation*, XSD/DTD *validation*, semantic diff, and
 * namespace resolution remain advertising-only — they depend on future
 * premium engines and are not registered here.
 */
export function buildXmlRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: xmlManifest,
    parsers: [createXmlTextParser({ clock })],
    exporters: freeExporters,
    proExporters,
  };
}
