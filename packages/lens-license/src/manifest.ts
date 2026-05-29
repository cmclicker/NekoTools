import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { LICENSE_KIND_PARSED } from './kinds.js';

/**
 * The NekoLicense manifest. Reading model matches the other lenses:
 * `entitlements.free` ships (engine + UI); `entitlements.pro` advertises a
 * future package, and the two Pro exporter ids are declared but NOT
 * registered (monetization-safety tests assert they throw "unknown
 * exporter"). Offline policy is `network-forbidden`.
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
    // Pro — declared as advertising, NOT registered in the free build.
    'license.export.compatibility',
    'license.export.notice',
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
      'compatibility.matrix',
      'dependency.scan',
      'notice.generate',
      'custom.fingerprints',
      'export.compatibility',
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
