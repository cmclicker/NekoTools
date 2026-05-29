import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { SORT_KIND_PARSED } from './kinds.js';

/**
 * The NekoSort manifest. Reading model matches the other lenses:
 * `entitlements.free` ships (engine + UI); `entitlements.pro` advertises a
 * future package, and the two Pro exporter ids are declared but NOT
 * registered (monetization-safety tests assert they throw "unknown
 * exporter"). Offline policy is `network-forbidden`.
 */
export const sortManifest: ToolManifest = {
  version: 1,
  id: 'sort',
  name: 'NekoSort',
  toolVersion: 1,
  summary:
    'Sort, dedupe, and clean lines locally — ascending/descending, unique, case-insensitive, numeric, trim, and blank removal. Paste lines, tweak the options.',
  artifactKinds: [SORT_KIND_PARSED],
  parsers: ['sort.text'],
  exporters: [
    'sort.export.json',
    'sort.export.normalized',
    'sort.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'sort.export.diff',
    'sort.export.frequency',
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
      'sort',
      'dedupe',
      'trim',
      'inspect.counts',
      'diagnostics.lines',
      'export.json',
      'export.normalized',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'sort.by-column',
      'sort.by-key',
      'frequency.count',
      'shuffle',
      'natural.sort',
      'export.diff',
      'export.frequency',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'column/field-aware sorting (split by delimiter, sort by Nth field) — Pro',
    'natural / version-aware sort beyond the basic numeric option',
    'frequency counting and shuffle (Pro)',
    'locale-aware collation (uses default JS string comparison)',
    'network access of any kind during inspection',
  ],
};
