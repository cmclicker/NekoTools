import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createTimeParser } from './parser.js';
import { freeExporters } from './exporters.js';
import { timeManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './resolve.js';
export * from './parser.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Build a NekoTime registration for the runtime. The free build registers
 * only the `time.parse` parser and the free exporters; the Pro exporter
 * ids declared in the manifest (batch CSV, timezone board) are advertising
 * and are NOT registered here.
 *
 * The default clock is a fixed epoch so engine tests are deterministic;
 * the web-suite adapter passes a live system clock so the relative-age
 * field reflects the real "now".
 */
export function buildTimeRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
): ToolRegistration {
  return {
    manifest: timeManifest,
    parsers: [createTimeParser({ clock })],
    exporters: freeExporters,
  };
}
