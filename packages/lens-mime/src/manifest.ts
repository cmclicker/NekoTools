import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { MIME_KIND_PARSED } from './kinds.js';

/**
 * The NekoMIME manifest. Reading model matches the other lenses:
 * `entitlements.free` ships (engine + UI); `entitlements.pro` advertises the
 * Pro surface. The two Pro exporter ids (`mime.export.iana-lookup`,
 * `mime.export.csv`) are declared here AND registered as `proExporters` in the
 * single build — `runExporter` gates them behind a valid entitlement
 * (entitlement-gated tests assert a free caller is refused with
 * `EntitlementError` while a Pro caller gets real output). They derive purely
 * from the parsed report plus a bundled IANA common-subset table; the
 * remaining Pro entitlements (sniff/charset/Accept-header/snapshots) stay
 * advertising-only. Offline policy is `network-forbidden`.
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
    // Pro — declared here AND registered as proExporters; entitlement-gated.
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
