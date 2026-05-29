import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { PACKAGE_KIND_MANIFEST } from './kinds.js';

export const packageManifest: ToolManifest = {
  version: 1,
  id: 'package',
  name: 'NekoPackage',
  toolVersion: 1,
  summary:
    'Inspect package.json locally: metadata, scripts, dependency sections, duplicate dependencies, remote specs, and basic script-risk diagnostics.',
  artifactKinds: [PACKAGE_KIND_MANIFEST],
  parsers: ['package.json'],
  exporters: [
    'package.export.summary.json',
    'package.export.markdown.summary',
    'package.export.policy.report',
    'package.export.ci.guard',
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
      'inspect.metadata',
      'inspect.scripts',
      'inspect.dependencies',
      'diagnostics.basic-risk',
      'export.summary.json',
      'export.markdown.summary',
      'copy.summary',
      'workspace.save',
    ],
    pro: [
      'policy.packs',
      'lockfile.audit',
      'script.policy',
      'dependency.baseline',
      'ci.guard.export',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'fetching registry metadata or package tarballs',
    'installing dependencies or running package scripts',
    'full vulnerability scanning without user-imported local advisory data',
    'lockfile graph analysis beyond package.json summary in this quick slice',
    'network access of any kind during inspection',
  ],
};
