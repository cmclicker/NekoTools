import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { SEMVER_KIND_PARSED } from './kinds.js';

/**
 * The NekoSemver manifest. Reading model matches the other lenses:
 * `entitlements.free` ships (engine + UI); `entitlements.pro` advertises a
 * future package, and the two Pro exporter ids are declared but NOT
 * registered (monetization-safety tests assert they throw "unknown
 * exporter"). Offline policy is `network-forbidden` — pure comparison
 * logic; it never queries a registry for published versions.
 */
export const semverManifest: ToolManifest = {
  version: 1,
  id: 'semver',
  name: 'NekoSemver',
  toolVersion: 1,
  summary:
    'Parse, compare, and range-check semantic versions locally — components, spec-precedence sort, and satisfies against ^/~/x-range/hyphen/|| ranges. No registry lookups.',
  artifactKinds: [SEMVER_KIND_PARSED],
  parsers: ['semver.text'],
  exporters: [
    'semver.export.json',
    'semver.export.sorted',
    'semver.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'semver.export.range.report',
    'semver.export.bump.plan',
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
      'inspect.components',
      'compare.sort',
      'range.satisfies',
      'diagnostics.format',
      'export.json',
      'export.sorted',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'bump.plan',
      'range.intersect',
      'range.subset',
      'registry.resolve',
      'changelog.link',
      'export.range.report',
      'export.bump.plan',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'resolving the latest published version from npm or any registry',
    'computing version bumps from commit history / conventional commits (Pro)',
    'full node-semver range edge cases (this ships a pragmatic subset)',
    'loose / non-strict version coercion beyond an optional leading v',
    'network access of any kind during inspection',
  ],
};
