import type { ToolRegistration } from '@nekotools/tool-runtime';
import { FIXED_CLOCK, type Clock } from '@nekotools/lens-kit';

import { freeExporters, proExporters } from './exporters.js';
import { logsManifest } from './manifest.js';
import { createLogFilterParser } from './parser-filter.js';
import { createLogTextParser } from './parser-text.js';

export * from './kinds.js';
export * from './diagnostics.js';
export * from './line-parse.js';
export * from './aggregate.js';
export * from './parser-text.js';
export * from './parser-filter.js';
export * from './codegen.js';
export * from './exporters.js';
export * from './manifest.js';
export { FIXED_CLOCK } from '@nekotools/lens-kit';

/**
 * Optional configuration for the NekoLogs registration. Mirrors the
 * other lenses' options shape — same knob, same 10 MB default.
 */
export interface BuildLogsRegistrationOptions {
  readonly largeDocumentBytes?: number;
}

/**
 * Build a NekoLogs registration for the runtime. Free exporters run for
 * everyone. The Pro exporters (incident report, histogram SVG, message-
 * pattern clusters) are registered as `proExporters` and gated by
 * `runExporter` behind a valid entitlement (single-build-gated model, same
 * as NekoCSV / NekoXML). They render artifacts the free run already
 * produces. The statistical anomaly-detection, semantic-diff, saved-query,
 * and trace-graph Pro features remain advertising-only — they depend on
 * future premium engines and are not registered here.
 */
export function buildLogsRegistration(
  clock: Clock = FIXED_CLOCK('1970-01-01T00:00:00.000Z'),
  options: BuildLogsRegistrationOptions = {},
): ToolRegistration {
  const textDeps =
    options.largeDocumentBytes !== undefined
      ? { clock, largeDocumentBytes: options.largeDocumentBytes }
      : { clock };
  return {
    manifest: logsManifest,
    parsers: [createLogTextParser(textDeps), createLogFilterParser({ clock })],
    exporters: freeExporters,
    proExporters,
  };
}
