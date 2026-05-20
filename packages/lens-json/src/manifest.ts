import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import {
  JSON_KIND_DIFF,
  JSON_KIND_DOCUMENT,
  JSON_KIND_PATH_RESULT,
  JSON_KIND_SCHEMA,
} from './kinds.js';

/**
 * The NekoJSON manifest.
 *
 * Reading model (this is the rule that resolves the audit feedback on
 * PR #2):
 *
 *   - `entitlements.free` lists features that THIS BUILD ships with a
 *     working implementation. Unimplemented free features must not
 *     appear here — they would be misleading advertising.
 *   - `entitlements.pro` lists features that a future paid build will
 *     ship via a private `@nekotools-pro/*` package. They appear here
 *     as honest intent advertising; the free build does not link any
 *     Pro implementation, so a free user cannot invoke them even if
 *     they see them in the manifest.
 *   - `capabilities.*` flags describe what THIS BUILD can do right
 *     now. They are not lifetime promises of the tool family.
 *   - `parsers` / `exporters` / `graphProjectors` may list ids that
 *     are declared as Pro intent. The runtime registry only validates
 *     the forward direction (every *registered* implementation must be
 *     declared here); it does not require every declared id to be
 *     registered. That asymmetry is what makes Pro advertising work
 *     without lying about the free build.
 *
 * MVP-shipped features are kept in sync with `buildJsonRegistration()`
 * by the monetization-safety tests in `__tests__/conformance.test.ts`.
 */
export const jsonManifest: ToolManifest = {
  version: 1,
  id: 'json',
  name: 'NekoJSON',
  toolVersion: 1,
  summary:
    'Inspect, validate, navigate, and export local JSON documents. Phase 1 proof tool.',
  artifactKinds: [JSON_KIND_DOCUMENT, JSON_KIND_PATH_RESULT, JSON_KIND_SCHEMA, JSON_KIND_DIFF],
  parsers: ['json.text', 'json.pointer', 'json.diff.textual'],
  exporters: [
    'json.export.json.pretty',
    'json.export.json.minified',
    'json.export.markdown.summary',
    'json.export.plaintext.paths',
    'json.export.schema.json-schema',
    'json.export.diff.textual',
    'json.export.types.typescript',
    'json.export.types.zod',
    'json.export.docs.data-dictionary',
  ],
  graphProjectors: ['json.graph.references'],
  offlinePolicy: DEFAULT_OFFLINE_POLICY,
  capabilities: {
    canSaveWorkspace: true,
    canExport: true,
    // Phase 1.1a flipped canDiff from false to true with the arrival
    // of the textual diff engine. Semantic diff (Pro) does not affect
    // this flag — capabilities is current-build truth, and the Pro
    // module ships separately when it ships.
    canDiff: true,
    // Still false: the graph projector is Pro and not in this binary.
    canProjectGraph: false,
  },
  entitlements: {
    // Every entry below has a working free implementation in this
    // build. As of Phase 1.1h, no charter-declared free feature is
    // deferred — Phase 1's free tier is fully shipped. Future free
    // entitlements must be added only in the same PR that ships
    // their implementation (per the open-core governance rule from
    // the PR #2 audit).
    free: [
      'parse',
      'format',
      'minify',
      'validate',
      'inspect.pointer',
      'schema.infer.basic',
      'diff.textual',
      'export.json.pretty',
      'export.json.minified',
      'export.markdown.summary',
      'export.plaintext.paths',
      'export.schema.basic',
      'export.diff.textual',
      'workspace.save',
      // Phase 1.1f — UI views shipped in apps/web-suite.
      'view.tree',
      'view.text',
      // Phase 1.1g — table view + search shipped in apps/web-suite.
      'view.table',
      'search',
      // Phase 1.1h — local-clipboard copy affordances shipped in
      // apps/web-suite. Closes the Phase 1 free-tier feature set.
      'copy.path',
      'copy.value',
    ],
    pro: [
      'view.graph',
      'diff.semantic',
      'migration.studio',
      'batch.transform',
      'schema.infer.advanced',
      'export.types.typescript',
      'export.types.zod',
      'export.docs.data-dictionary',
      'references.broken',
      'references.duplicate',
    ],
  },
  outOfScope: [
    'fetching $ref URLs or any remote schemas',
    'executing JSON-Logic / JSONata / JMESPath or any other programmable query language',
    'acting as a remote schema registry',
    'streaming gigantic JSON beyond the local size threshold',
  ],
};
