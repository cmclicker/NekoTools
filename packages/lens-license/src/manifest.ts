import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { LICENSE_KIND_PARSED } from './kinds.js';

/**
 * The NekoLicense manifest. Reading model matches NekoJWT / NekoCSP:
 * `entitlements.free` ships (engine + UI); `entitlements.pro` advertises
 * future capabilities; and the two Pro exporter ids
 * (`license.export.audit.report`, `license.export.sarif`) are registered in
 * this build but gated behind a valid entitlement (monetization-safety tests
 * assert a free caller is refused with EntitlementError). Offline policy is
 * `network-forbidden`.
 */
export const licenseManifest: ToolManifest = {
  version: 1,
  id: 'license',
  name: 'NekoLicense',
  toolVersion: 1,
  summary:
    'Identify a pasted LICENSE file locally — detect the SPDX id (MIT, Apache-2.0, GPL, BSD, ISC, MPL, …) and summarize its permissions, conditions, and limitations. No network.',
  artifactKinds: [LICENSE_KIND_PARSED],
  parsers: ['license.text'],
  exporters: [
    'license.export.json',
    'license.export.normalized',
    'license.export.markdown.summary',
    // Pro — registered in this build but gated behind a valid entitlement.
    'license.export.audit.report',
    'license.export.sarif',
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
      'detect',
      'inspect.terms',
      'read.spdx-tag',
      'diagnostics.detection',
      'export.json',
      'export.normalized',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'audit.obligations',
      'compatibility.matrix',
      'dependency.scan',
      'notice.generate',
      'custom.fingerprints',
      'export.compatibility',
      'export.sarif',
      'export.notice',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'the full SPDX license list / exact text fingerprinting (a common subset ships here)',
    'license compatibility analysis across a dependency tree (Pro)',
    'generating a combined NOTICE / attribution file (Pro)',
    'legal advice — detection is heuristic and informational only',
    'network access of any kind during inspection',
  ],
};
