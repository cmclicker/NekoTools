import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { MIME_KIND_PARSED } from './kinds.js';

/**
 * The NekoMIME manifest. Reading model matches the other lenses:
 * `entitlements.free` ships (engine + UI); `entitlements.pro` advertises a
 * future package, and the two Pro exporter ids are declared but NOT
 * registered (monetization-safety tests assert they throw "unknown
 * exporter"). Offline policy is `network-forbidden`.
 */
export const mimeManifest: ToolManifest = {
  version: 1,
  id: 'mime',
  name: 'NekoMIME',
  toolVersion: 1,
  summary:
    'Inspect MIME / Content-Type strings and file extensions locally — type/subtype, +suffix, registration tree, parameters (charset, boundary), and type↔extension lookup. No content sniffing.',
  artifactKinds: [MIME_KIND_PARSED],
  parsers: ['mime.text'],
  exporters: [
    'mime.export.json',
    'mime.export.normalized',
    'mime.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'mime.export.iana-lookup',
    'mime.export.csv',
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
      'inspect.parameters',
      'lookup.extension',
      'diagnostics.format',
      'export.json',
      'export.normalized',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'lookup.iana-full',
      'sniff.magic-bytes',
      'detect.charset',
      'compare.accept-header',
      'export.iana-lookup',
      'export.csv',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'content sniffing / magic-byte detection of the actual bytes (Pro)',
    'the full IANA media-type registry (a common subset ships here)',
    'Accept-header q-value negotiation and matching (Pro)',
    'charset transcoding or validation of the declared charset',
    'network access of any kind during inspection',
  ],
};
