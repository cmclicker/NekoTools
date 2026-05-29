import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { CSV_KIND_TABLE } from './kinds.js';

export const csvManifest: ToolManifest = {
  version: 1,
  id: 'csv',
  name: 'NekoCSV',
  toolVersion: 1,
  summary:
    'Inspect CSV and TSV tables locally: headers, row shape, quoted fields, empty cells, and normalized exports.',
  artifactKinds: [CSV_KIND_TABLE],
  parsers: ['csv.text'],
  exporters: [
    'csv.export.summary.json',
    'csv.export.markdown.summary',
    'csv.export.normalized.csv',
    'csv.export.profile.report',
    'csv.export.schema.json',
    'csv.export.cleaning.recipe',
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
      'parse.csv',
      'parse.tsv',
      'inspect.table',
      'inspect.headers',
      'diagnostics.shape',
      'export.summary.json',
      'export.markdown.summary',
      'export.normalized.csv',
      'copy.summary',
      'workspace.save',
    ],
    pro: [
      'profile.columns',
      'infer.schema',
      'detect.types',
      'compare.datasets',
      'batch.clean',
      'export.profile.report',
      'export.schema.json',
      'export.cleaning.recipe',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'fetching remote datasets',
    'executing formulas or spreadsheet macros',
    'streaming multi-gigabyte files in this quick slice',
    'statistical profiling beyond structural CSV diagnostics',
    'network access of any kind during inspection',
  ],
};
