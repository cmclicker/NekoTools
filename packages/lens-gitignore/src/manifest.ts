import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { GITIGNORE_KIND_PARSED } from './kinds.js';

/**
 * The NekoGitignore manifest. Reading model matches NekoJWT / NekoCSP:
 * `entitlements.free` ships (engine + UI); `entitlements.pro` advertises
 * future capabilities; and the two Pro exporter ids
 * (`gitignore.export.regex`, `gitignore.export.merged`) are registered in this
 * build but gated behind a valid entitlement (monetization-safety tests assert
 * a free caller is refused with EntitlementError). Offline policy is
 * `network-forbidden` — it never touches the filesystem or a repo.
 */
export const gitignoreManifest: ToolManifest = {
  version: 1,
  id: 'gitignore',
  name: 'NekoGitignore',
  toolVersion: 1,
  summary:
    'Parse and test .gitignore locally — classify each rule (negation, anchor, dir-only, globs) and check which paths a ruleset ignores. No filesystem, no repo, no network.',
  artifactKinds: [GITIGNORE_KIND_PARSED],
  parsers: ['gitignore.text'],
  exporters: [
    'gitignore.export.json',
    'gitignore.export.normalized',
    'gitignore.export.markdown.summary',
    // Pro — registered in this build but gated behind a valid entitlement.
    'gitignore.export.regex',
    'gitignore.export.merged',
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
      'classify.patterns',
      'test.paths',
      'diagnostics.structure',
      'export.json',
      'export.normalized',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'audit.secrets',
      'merge.files',
      'explain.match',
      'template.library',
      'redundancy.analyze',
      'scan.repo-local',
      'export.regex',
      'export.merged',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'reading a real working tree or .git/info/exclude from disk',
    'the full Git pathspec edge cases (this is a pragmatic glob subset)',
    'the parent-directory re-inclusion rule for negated patterns',
    'merging nested .gitignore files by directory precedence (Pro)',
    'network access of any kind during inspection',
  ],
};
