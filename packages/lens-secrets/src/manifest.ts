import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { SECRET_KIND_REPORT } from './kinds.js';

/**
 * The NekoSecrets manifest.
 *
 * Reading model matches the other lenses: `entitlements.free` is what this
 * build actually ships; `entitlements.pro` advertises a future
 * `@nekotools-pro/*` package, and the two Pro exporter ids are declared but
 * NOT registered (monetization-safety tests assert they throw
 * "unknown exporter").
 *
 * Offline policy is `network-forbidden` — and this tool is the strongest
 * argument for the whole local-first thesis: you paste a file you suspect
 * contains credentials, and nothing leaves your machine. Findings store
 * only masked previews + locations, never the raw secret, so even the
 * saved workspace and the exports are safe to share.
 */
export const secretsManifest: ToolManifest = {
  version: 1,
  id: 'secrets',
  name: 'NekoSecrets',
  toolVersion: 1,
  summary:
    'Scan pasted text and config for leaked credentials locally — provider patterns (AWS, GitHub, Slack, Stripe, …) plus entropy detection. Findings are masked; nothing is ever uploaded.',
  artifactKinds: [SECRET_KIND_REPORT],
  parsers: ['secret.text'],
  exporters: [
    'secret.export.json',
    'secret.export.csv',
    'secret.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'secret.export.sarif',
    'secret.export.redacted',
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
      'scan.patterns',
      'scan.entropy',
      'inspect.findings',
      'diagnostics.security',
      'mask.findings',
      'export.json',
      'export.csv',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'rules.custom',
      'allowlist.manage',
      'scan.git-history',
      'baseline.diff',
      'entropy.tuning',
      'redact.document',
      'export.sarif',
      'export.redacted',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'uploading input or findings to any service or remote scanner',
    'validating whether a detected credential is live (no network calls)',
    'scanning git history, remote repos, or the filesystem in this slice',
    'redacting the source document (Pro — requires retaining the cleartext)',
    'guaranteeing zero false positives — entropy hits are heuristic',
  ],
};
