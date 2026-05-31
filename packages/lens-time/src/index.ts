import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { createTimeParser } from './parser.js';
import { freeExporters, proExporters } from './exporters.js';
import { timeManifest } from './manifest.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './resolve.js';
export * from './parser.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Build a NekoTime registration for the runtime. Free exporters run for
 * everyone. The Pro exporters (batch CSV + timezone board) are registered as
 * `proExporters` and gated by `runExporter` behind a valid entitlement
 * (single-build-gated model, same as NekoTOML / NekoJSON). Both Pro
 * generators are pure, offline, and depend only on the resolved instant plus
 * the host `Intl` runtime — no premium engine.
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
    proExporters,
  };
}
