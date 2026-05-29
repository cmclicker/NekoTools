import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { REGEX_KIND_MATCHSET } from './kinds.js';

/**
 * The NekoRegex manifest (Free vertical slice).
 *
 * Reading model (same as the other lenses):
 *   - `entitlements.free` lists features THIS build ships with a working
 *     implementation. Because this slice ships the engine AND the UI in one
 *     PR, the UI affordances (test / match.* / export.*) are included here
 *     honestly — they are all live in this build.
 *   - `entitlements.pro` is advertising for a future `@nekotools-pro/*`
 *     package; nothing Pro is bundled, gated, or verified here.
 *   - `exporters` lists Pro exporter ids that are declared but NOT
 *     registered in the free build (monetization-safety tests enforce
 *     that they stay unregistered).
 */
export const regexManifest: ToolManifest = {
  version: 1,
  id: 'regex',
  name: 'NekoRegex',
  toolVersion: 1,
  summary:
    'Test regular expressions locally — matches, capture groups, named groups, and safety diagnostics. Native RegExp only; no eval, no network, no LLM.',
  artifactKinds: [REGEX_KIND_MATCHSET],
  parsers: ['regex.match'],
  exporters: [
    'regex.export.json',
    'regex.export.markdown.summary',
    'regex.export.pattern',
    // Pro — declared as advertising, NOT registered in the free build.
    'regex.export.explain',
    'regex.export.redaction.recipe',
    'regex.export.suite',
    'regex.export.snapshot',
  ],
  offlinePolicy: DEFAULT_OFFLINE_POLICY,
  capabilities: {
    // The free slice keeps everything in-memory: no saved suites/workspaces
    // (that is a Pro affordance), no diff, no graph.
    canSaveWorkspace: false,
    canExport: true,
    canDiff: false,
    canProjectGraph: false,
  },
  entitlements: {
    free: [
      'test',
      'match.count',
      'match.list',
      'capture.groups',
      'named.groups',
      'match.indices',
      'diagnostics',
      'export.json',
      'export.markdown.summary',
      'export.pattern',
    ],
    pro: [
      'suites.saved',
      'batch.test-cases',
      'explain.mode',
      'snapshots.regression',
      'redaction.recipes',
      'workspace.recipe-packs',
    ],
  },
  outOfScope: [
    'remote or LLM-backed regex explanation (the Free build uses native RegExp only)',
    'generating regular expressions from natural-language prompts',
    'non-JavaScript regex dialects (PCRE / RE2 / .NET / Oniguruma-specific syntax)',
    'fetching or testing against remote data sources',
    'timeout-enforced or proof-based catastrophic-backtracking protection',
  ],
};
