import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { HEX_KIND_PARSED } from './kinds.js';

/**
 * The NekoHex manifest. Reading model matches the other lenses:
 * `entitlements.free` ships (engine + UI); `entitlements.pro` advertises a
 * future package, and the two Pro exporter ids are declared but NOT
 * registered (monetization-safety tests assert they throw "unknown
 * exporter"). Offline policy is `network-forbidden`.
 */
export const hexManifest: ToolManifest = {
  version: 1,
  id: 'hex',
  name: 'NekoHex',
  toolVersion: 1,
  summary:
    'Hex-dump text or decode a hex string locally — classic offset / hex / ASCII view, continuous hex, and byte counts. UTF-8 text mode or hex-decode mode.',
  artifactKinds: [HEX_KIND_PARSED],
  parsers: ['hex.text'],
  exporters: [
    'hex.export.json',
    'hex.export.normalized',
    'hex.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'hex.export.c-array',
    'hex.export.base64',
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
      'dump.text',
      'decode.hex',
      'inspect.bytes',
      'diagnostics.hex',
      'export.json',
      'export.normalized',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'export.c-array',
      'export.base64',
      'diff.bytes',
      'edit.bytes',
      'search.pattern',
      'decode.struct',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'reading binary files from disk (paste text or a hex string)',
    'editing bytes in place or patching (Pro)',
    'struct/typed decoding of byte ranges (Pro)',
    'byte-level diffing of two inputs (Pro)',
    'network access of any kind during inspection',
  ],
};
