import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { HEADERS_KIND_DOCUMENT } from './kinds.js';

/**
 * The NekoHeaders manifest (Wave 3 engine + UI MVP).
 *
 * Free ships the parse / validate / basic-security-hints / JSON +
 * markdown export / workspace surface. Pro (advertising only, not
 * registered): deep security audit, CORS/CSP policy packs, profile
 * comparison, redaction, batch audit.
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
    // Pro — implemented + gated in this binary.
    'headers.export.audit.report',
    'headers.export.sarif',
    // Pro — advertised-future (declared, not yet registered).
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
      'export.audit.report',
      'export.sarif',
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
