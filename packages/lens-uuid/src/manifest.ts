import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { UUID_KIND_PARSED } from './kinds.js';

/**
 * The NekoUUID manifest.
 *
 * Reading model matches the other lenses: `entitlements.free` is what ships
 * (engine + UI); `entitlements.pro` advertises a future `@nekotools-pro/*`
 * package, and the two Pro exporter ids are declared but NOT registered
 * (monetization-safety tests assert they throw "unknown exporter").
 *
 * Offline policy is `network-forbidden`. NekoUUID is pure bit-math over the
 * pasted identifiers — it inspects, it never *generates* (generation needs
 * randomness/a clock and is intentionally Pro/out-of-scope here).
 */
export const uuidManifest: ToolManifest = {
  version: 1,
  id: 'uuid',
  name: 'NekoUUID',
  toolVersion: 1,
  summary:
    'Inspect UUIDs and ULIDs locally — version, variant, nil/max, and embedded timestamps (UUID v1/v6/v7, ULID). Paste one per line. No network, no generation.',
  artifactKinds: [UUID_KIND_PARSED],
  parsers: ['uuid.text'],
  exporters: [
    'uuid.export.json',
    'uuid.export.normalized',
    'uuid.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'uuid.export.namespace.report',
    'uuid.export.bulk.csv',
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
      'parse.uuid',
      'parse.ulid',
      'inspect.version',
      'extract.timestamp',
      'diagnostics.format',
      'export.json',
      'export.normalized',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'generate',
      'inspect.namespace',
      'decode.node-mac',
      'bulk.analyze',
      'convert.formats',
      'export.namespace.report',
      'export.bulk.csv',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'generating new UUIDs/ULIDs (needs randomness/a clock — Pro)',
    'reversing v3/v5 name hashes or extracting the v1 node MAC address (Pro)',
    'validating that a v4 was sourced from a cryptographically secure RNG',
    'timezone-local rendering of embedded timestamps (always shown in UTC)',
    'network access of any kind during inspection',
  ],
};
