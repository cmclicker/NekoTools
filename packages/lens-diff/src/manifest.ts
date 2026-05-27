import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { DIFF_KIND_RESULT } from './kinds.js';

/**
 * The NekoDiff manifest (vertical-slice MVP).
 *
 * Reading model (same as the other lenses):
 *   - `entitlements.free` lists features THIS build ships with a working
 *     implementation. NekoDiff is a full vertical slice (engine + UI in one
 *     PR), so its free set includes the three compare modes, the changed-
 *     count summary, the unified view, the three exports, the copy
 *     affordance, and workspace save — every one of which is implemented
 *     here. The monetization-safety tests assert this set exactly.
 *   - `entitlements.pro` is advertising for a future `@nekotools-pro/*`
 *     package; nothing Pro is bundled in this local build.
 *   - `exporters` may list Pro ids that are declared but NOT registered in
 *     the free build. The registry validates only the forward direction
 *     (every registered impl must be declared), so declaring-without-
 *     registering is the advertising surface.
 */
export const diffManifest: ToolManifest = {
  version: 1,
  id: 'diff',
  name: 'NekoDiff',
  toolVersion: 1,
  summary:
    'Compare two inputs locally — line, JSON-aware, and YAML-aware diff with a changed-line summary and unified / JSON / Markdown export. Cross-tool comparison glue.',
  artifactKinds: [DIFF_KIND_RESULT],
  parsers: ['diff.text', 'diff.json', 'diff.yaml'],
  exporters: [
    'diff.export.unified',
    'diff.export.json',
    'diff.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'diff.export.semantic',
    'diff.export.bundle.signed',
  ],
  offlinePolicy: DEFAULT_OFFLINE_POLICY,
  capabilities: {
    canSaveWorkspace: true,
    canExport: true,
    canDiff: true,
    canProjectGraph: false,
  },
  entitlements: {
    free: [
      'diff.text',
      'diff.json',
      'diff.yaml',
      'summary.counts',
      'view.unified',
      'export.unified',
      'export.json',
      'export.markdown',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'diff.semantic',
      'diff.ignore-order',
      'recipe.saved',
      'workspace.snapshots',
      'batch.diff',
      'policy.drift',
      'bundle.signed',
    ],
  },
  outOfScope: [
    'three-way / merge-conflict resolution',
    'binary or image diffing',
    'fetching either side from a URL, git ref, or file path',
    'syntax-aware semantic diff (declared Pro, not bundled in this build)',
    'live file watching or durable storage',
  ],
};
