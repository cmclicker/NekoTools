import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { ALL_BINARY_KINDS } from './kinds.js';

export const binaryManifest: ToolManifest = {
  version: 1,
  id: 'binary',
  name: 'NekoBinary',
  toolVersion: 1,
  summary:
    'Convert and inspect binary, hex, decimal, base64, and UTF-8 inputs locally. Phase 0 conformance lens.',
  artifactKinds: [...ALL_BINARY_KINDS],
  parsers: [
    'binary.decimal',
    'binary.binary',
    'binary.hex',
    'binary.base64',
    'binary.utf8',
  ],
  exporters: [
    'binary.export.json',
    'binary.export.markdown',
    'binary.export.plaintext',
    'binary.export.batch.report',
    'binary.export.byte-map',
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
      'parse.decimal',
      'parse.binary',
      'parse.hex',
      'parse.base64',
      'parse.utf8',
      'export.json',
      'export.markdown',
      'export.plaintext',
      'workspace.save',
    ],
    pro: [
      'batch.convert',
      'inspect.byte-map',
      'inspect.magic-signature',
      'inspect.endianness',
      'export.batch.report',
      'export.byte-map',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'fetching live data from the network',
    'parsing arbitrary binary file formats',
    'cryptographic decoding of encrypted payloads',
  ],
};
