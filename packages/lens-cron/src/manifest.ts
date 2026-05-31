import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { CRON_KIND_PARSED } from './kinds.js';

/**
 * The NekoCron manifest.
 *
 * Reading model matches the other lenses: `entitlements.free` is what every
 * build ships unconditionally; `entitlements.pro` advertises the gated
 * surface. The two Pro exporter ids (`cron.export.ical`,
 * `cron.export.timezone.report`) are declared here AND registered as
 * `proExporters`, gated by `runExporter` behind a valid entitlement
 * (single-build-gated model — see `buildCronRegistration`). Both derive purely
 * from the already-computed UTC next runs. The remaining Pro entitlements
 * (calendar scheduling, schedule compare/overlap, workspace snapshots) remain
 * advertising-only — they depend on future premium engines and ship no impl.
 *
 * Offline policy is `network-forbidden`. Next-run times are computed in
 * UTC from the local clock — no timezone database is fetched, which is
 * also why timezone-aware *scheduling* is out-of-scope; the Pro timezone
 * report only RENDERS those UTC instants in other zones via `Intl`.
 */
export const cronManifest: ToolManifest = {
  version: 1,
  id: 'cron',
  name: 'NekoCron',
  toolVersion: 1,
  summary:
    'Parse and explain cron expressions locally — field breakdown, a plain-English description, and the next run times (UTC). Supports 5-field, 6-field (seconds), and @macros.',
  artifactKinds: [CRON_KIND_PARSED],
  parsers: ['cron.text'],
  exporters: [
    'cron.export.json',
    'cron.export.next-runs',
    'cron.export.markdown.summary',
    // Pro — declared here and registered as proExporters (entitlement-gated).
    'cron.export.ical',
    'cron.export.timezone.report',
  ],
  offlinePolicy: DEFAULT_OFFLINE_POLICY,
  capabilities: {
    canSaveWorkspace: true,
    canExport: true,
    canDiff: false,
    canProjectGraph: false,
  },
  entitlements: {
    free: [
      'parse',
      'inspect.fields',
      'describe',
      'next-runs',
      'diagnostics.range',
      'export.json',
      'export.next-runs',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'timezone.aware',
      'next-runs.calendar',
      'compare.schedules',
      'overlap.detect',
      'export.ical',
      'export.timezone.report',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'timezone-aware scheduling (next runs are computed in UTC)',
    'Quartz / Vixie extensions: L, W, # and ? specifiers',
    'the optional Quartz year field (only 5- and 6-field forms are parsed)',
    'actually scheduling or executing anything — this only explains expressions',
    'network access of any kind during inspection',
  ],
};
