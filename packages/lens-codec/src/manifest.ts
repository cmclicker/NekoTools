import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { CODEC_KIND_TRANSFORM } from './kinds.js';

/**
 * The NekoCodec manifest (vertical-slice engine + UI MVP).
 *
 * Reading model (same as the other lenses):
 *   - `entitlements.free` lists features THIS build ships with a working
 *     implementation: the four codecs (encode + decode), binary detection,
 *     the three exporters, the copy affordance, and workspace save.
 *   - `entitlements.pro` is advertising for a future `@nekotools-pro/*`
 *     package; nothing Pro is bundled here (no account, no telemetry, no
 *     remote check).
 *   - `exporters` lists Pro ids that are declared but NOT registered in the
 *     free build. The registry validates only the forward direction (every
 *     registered impl must be declared), so advertising-only ids are safe.
 */
export const codecManifest: ToolManifest = {
  version: 1,
  id: 'codec',
  name: 'NekoCodec',
  toolVersion: 1,
  summary:
    'Encode and decode text locally: Base64, Base64URL, URL percent-encoding, and hex, with UTF-8-safe handling and validation diagnostics. Zero telemetry.',
  artifactKinds: [CODEC_KIND_TRANSFORM],
  parsers: ['codec.transform'],
  exporters: [
    'codec.export.text',
    'codec.export.summary.json',
    'codec.export.summary.markdown',
    // Pro — declared as advertising, NOT registered in the free build.
    'codec.export.batch.report',
    'codec.export.recipe.bundle',
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
      'encode.base64',
      'decode.base64',
      'encode.base64url',
      'decode.base64url',
      'encode.url',
      'decode.url',
      'encode.hex',
      'decode.hex',
      'detect.binary',
      'export.text',
      'export.summary.json',
      'export.summary.markdown',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'batch.transform',
      'recipes.saved',
      'chain.transforms',
      'redaction.aware',
      'workspace.snapshots',
      'bundle.signed',
    ],
  },
  outOfScope: [
    'hashing or checksums (MD5 / SHA / CRC) — NekoHash owns hashing',
    'encryption, decryption, or signing of any kind',
    'compression (gzip / deflate / brotli)',
    'character-set transcoding beyond UTF-8 (Latin-1, UTF-16, Shift-JIS, …)',
    'fetching or decoding remote resources referenced by the input',
  ],
};
