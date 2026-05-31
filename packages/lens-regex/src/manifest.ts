import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { REGEX_KIND_MATCHSET, REGEX_KIND_SUITE } from './kinds.js';

/**
 * The NekoRegex manifest (Free vertical slice).
 *
 * Reading model (same as the other lenses):
 *   - `entitlements.free` lists features THIS build ships with a working
 *     implementation. Because this slice ships the engine AND the UI in one
 *     PR, the UI affordances (test / match.* / export.*) are included here
 *     honestly — they are all live in this build.
 *   - `entitlements.pro` lists the Pro feature flags. In the single-build
 *     model the Pro exporters ship in the binary but `runExporter` gates
 *     them behind a valid entitlement (a free caller gets EntitlementError).
 *   - `exporters` lists every exporter id — free plus the four gated Pro
 *     ids (explain, redaction.recipe, suite, snapshot). Each registered
 *     exporter MUST be declared here; the runtime fails closed otherwise.
 */
export const regexManifest: ToolManifest = {
  version: 1,
  id: 'regex',
  name: 'NekoRegex',
  toolVersion: 1,
  summary:
    'Test regular expressions locally — matches, capture groups, named groups, and safety diagnostics. Native RegExp only; no eval, no network, no LLM.',
  artifactKinds: [REGEX_KIND_MATCHSET, REGEX_KIND_SUITE],
  parsers: ['regex.match', 'regex.suite'],
  exporters: [
    'regex.export.json',
    'regex.export.markdown.summary',
    'regex.export.pattern',
    // Pro — registered in the binary, gated by entitlement (single-build).
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
