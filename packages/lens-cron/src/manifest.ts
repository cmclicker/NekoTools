import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { CRON_KIND_PARSED } from './kinds.js';

/**
 * The NekoCron manifest.
 *
 * Reading model matches the other lenses: `entitlements.free` is what ships
 * (engine + UI); `entitlements.pro` advertises a future `@nekotools-pro/*`
 * package, and the two Pro exporter ids are declared but NOT registered
 * (monetization-safety tests assert they throw "unknown exporter").
 *
 * Offline policy is `network-forbidden`. Next-run times are computed in
 * UTC from the local clock — no timezone database is fetched, which is
 * also why timezone-aware scheduling is explicitly Pro/out-of-scope.
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
    // Pro — declared as advertising, NOT registered in the free build.
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
