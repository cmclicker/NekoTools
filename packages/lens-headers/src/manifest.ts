import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { HEADERS_KIND_DOCUMENT } from './kinds.js';

/**
 * The NekoHeaders manifest. Reading model matches NekoJWT / NekoCSP:
 * `entitlements.free` ships (engine + UI); `entitlements.pro` advertises
 * future capabilities; and the two Pro exporter ids
 * (`headers.export.audit.report`, `headers.export.cors-csp.pack` — the
 * security.audit / packs.cors-csp capabilities) are registered in this build
 * but gated behind a valid entitlement (monetization-safety tests assert a
 * free caller is refused with EntitlementError).
 */
export const headersManifest: ToolManifest = {
  version: 1,
  id: 'headers',
  name: 'NekoHeaders',
  toolVersion: 1,
  summary:
    'Inspect HTTP headers locally: parse, validate, basic security hints, JSON export. Phase 2B breadth tool.',
  artifactKinds: [HEADERS_KIND_DOCUMENT],
  parsers: ['headers.text'],
  exporters: [
    'headers.export.json',
    'headers.export.markdown.summary',
    // Pro — registered in this build but gated behind a valid entitlement.
    'headers.export.audit.report',
    'headers.export.cors-csp.pack',
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
      'validate',
      'security.hints.basic',
      'export.json',
      'export.markdown.summary',
      'workspace.save',
    ],
    pro: [
      'security.audit',
      'packs.cors-csp',
      'compare.profiles',
      'redaction.presets',
      'batch.audit',
    ],
  },
  outOfScope: [
    'making HTTP requests or fetching headers from a URL',
    'TLS / certificate inspection',
    'header mutation or proxying',
    'remote security scoring services',
    'streaming arbitrarily large inputs beyond the local soft threshold',
  ],
};
