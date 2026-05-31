import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createUnicodeTextParser } from './parser-text.js';
import { freeExporters, proExporters } from './exporters.js';
import { unicodeManifest } from './manifest.js';

export * from './unicode.js';
export * from './kinds.js';
export * from './diagnostics.js';
export * from './parser-text.js';
export * from './names-data.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Build a NekoUnicode registration for the runtime. Free exporters run for
 * everyone. The Pro exporters (the `U+XXXX | char | name` markdown table and
 * the per-codepoint RFC-4180 CSV grid) are registered as `proExporters` and
 * gated by `runExporter` behind a valid entitlement (single-build-gated model,
 * same as NekoJSON / NekoTOML / NekoCSV). Names come from a small curated table
 * + algorithmic controls with a principled fallback, NOT the full UCD; the
 * block / confusable / bidi / normalization Pro features remain
 * advertising-only.
 */
export function buildUnicodeRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: unicodeManifest,
    parsers: [createUnicodeTextParser({ clock })],
    exporters: freeExporters,
    proExporters,
  };
}
