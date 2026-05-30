import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { CSP_KIND_PARSED } from './kinds.js';

/**
 * The NekoCSP manifest. Reading model matches NekoJWT:
 * `entitlements.free` ships (engine + UI); `entitlements.pro` advertises
 * future capabilities; and the two Pro exporter ids (`csp.export.report`,
 * `csp.export.sarif`) are registered in this build but gated behind a valid
 * entitlement (monetization-safety tests assert a free caller is refused
 * with EntitlementError). Offline policy is `network-forbidden`.
 */
export const cspManifest: ToolManifest = {
  version: 1,
  id: 'csp',
  name: 'NekoCSP',
  toolVersion: 1,
  summary:
    'Parse and audit a Content-Security-Policy locally — directive breakdown plus findings for unsafe-inline, unsafe-eval, wildcards, data: scripts, and missing directives. No network.',
  artifactKinds: [CSP_KIND_PARSED],
  parsers: ['csp.text'],
  exporters: [
    'csp.export.json',
    'csp.export.normalized',
    'csp.export.markdown.summary',
    // Pro — registered in this build but gated behind a valid entitlement.
    'csp.export.report',
    'csp.export.sarif',
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
      'inspect.directives',
      'audit.findings',
      'diagnostics.security',
      'export.json',
      'export.normalized',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'suggest.hardened',
      'compare.policies',
      'simulate.violations',
      'nonce.audit',
      'export.report',
      'export.sarif',
      'export.hardened',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'generating a hardened policy from your app’s observed resources (Pro)',
    'evaluating whether a specific URL would be allowed/blocked at runtime',
    'CSP Level 3 strict-dynamic / hash-nonce interaction analysis (basic checks only)',
    'fetching report-uri/report-to endpoints',
    'network access of any kind during inspection',
  ],
};
