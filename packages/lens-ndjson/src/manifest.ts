import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { NDJSON_KIND_PARSED } from './kinds.js';

/**
 * The NekoNDJSON manifest. Reading model matches the other lenses:
 * `entitlements.free` ships (engine + UI); `entitlements.pro` advertises a
 * future package, and the two Pro exporter ids are declared but NOT
 * registered (monetization-safety tests assert they throw "unknown
 * exporter"). Offline policy is `network-forbidden`.
 */
export const ndjsonManifest: ToolManifest = {
  version: 1,
  id: 'ndjson',
  name: 'NekoNDJSON',
  toolVersion: 1,
  summary:
    'Inspect newline-delimited JSON locally — per-line parsing with error isolation, inferred record shape, and NDJSON↔JSON-array conversion. One bad line never sinks the rest.',
  artifactKinds: [NDJSON_KIND_PARSED],
  parsers: ['ndjson.text'],
  exporters: [
    'ndjson.export.json',
    'ndjson.export.ndjson',
    'ndjson.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'ndjson.export.schema.json',
    'ndjson.export.csv',
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
      'inspect.records',
      'infer.shape',
      'diagnostics.lines',
      'convert.json-array',
      'export.json',
      'export.ndjson',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'infer.schema',
      'flatten.csv',
      'filter.records',
      'stream.large',
      'validate.schema',
      'export.schema.json',
      'export.csv',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'streaming multi-gigabyte NDJSON files in this quick slice',
    'JSON Schema inference with formats/enums (basic type union only)',
    'flattening nested records into a CSV grid (Pro)',
    'querying or filtering records by expression (Pro)',
    'network access of any kind during inspection',
  ],
};
