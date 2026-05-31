import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { DURATION_KIND_PARSED } from './kinds.js';

/**
 * The NekoDuration manifest. Reading model matches the other lenses:
 * `entitlements.free` ships (engine + UI); `entitlements.pro` advertises a
 * future package, and the two Pro exporter ids are declared but NOT
 * registered (monetization-safety tests assert they throw "unknown
 * exporter"). Offline policy is `network-forbidden`.
 */
export const durationManifest: ToolManifest = {
  version: 1,
  id: 'duration',
  name: 'NekoDuration',
  toolVersion: 1,
  summary:
    'Parse and convert durations locally — ISO-8601 (PT1H30M), humanized (1h30m, 90 min), or bare seconds → total seconds, normalized ISO, and a human form. Years/months use average lengths.',
  artifactKinds: [DURATION_KIND_PARSED],
  parsers: ['duration.text'],
  exporters: [
    'duration.export.json',
    'duration.export.normalized',
    'duration.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'duration.export.breakdown.csv',
    'duration.export.locale',
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
      'parse.iso',
      'parse.humanized',
      'convert.seconds',
      'normalize.iso',
      'diagnostics.format',
      'export.json',
      'export.normalized',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'sum.durations',
      'diff.durations',
      'locale.format',
      'calendar.aware',
      'export.breakdown.csv',
      'export.locale',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'calendar-aware durations (exact month/year lengths from an anchor date)',
    'locale formatting beyond the host Intl runtime (no bundled CLDR/ICU data ships; the Pro locale export uses Intl only)',
    'summing or diffing multiple durations (Pro)',
    'leap-second handling',
    'network access of any kind during inspection',
  ],
};
