import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { PASSWORD_KIND_REPORT } from './kinds.js';

/**
 * The NekoPassword manifest. Reading model matches the other lenses:
 * `entitlements.free` ships (engine + UI); `entitlements.pro` advertises a
 * future package, and the two Pro exporter ids are declared but NOT
 * registered (monetization-safety tests assert they throw "unknown
 * exporter").
 *
 * Offline policy is `network-forbidden` — and this is the point: a password
 * checker that phones home is a contradiction. NekoPassword assesses fully
 * on-device, and the artifact stores only metrics, never the password.
 */
export const passwordManifest: ToolManifest = {
  version: 1,
  id: 'password',
  name: 'NekoPassword',
  toolVersion: 1,
  summary:
    'Estimate password / passphrase strength locally — entropy, a 0–4 score, crack-time scenarios, and pattern warnings. The password never leaves your machine or enters the artifact.',
  artifactKinds: [PASSWORD_KIND_REPORT],
  parsers: ['password.text'],
  exporters: [
    'password.export.json',
    'password.export.crack-times',
    'password.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'password.export.policy.report',
    'password.export.audit.csv',
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
      'assess',
      'inspect.entropy',
      'estimate.crack-time',
      'detect.patterns',
      'diagnostics.strength',
      'export.json',
      'export.crack-times',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'policy.check',
      'breach.check-local',
      'dictionary.extended',
      'batch.assess',
      'generate.passphrase',
      'export.policy.report',
      'export.audit.csv',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'checking the password against any online breach corpus (would need the network)',
    'storing, exporting, or round-tripping the password itself (only metrics persist)',
    'a full zxcvbn dictionary / l33t-speak match graph (heuristic subset only)',
    'generating passwords or passphrases (Pro)',
    'network access of any kind during assessment',
  ],
};
