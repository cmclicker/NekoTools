import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import {
  ENV_KIND_DIFF,
  ENV_KIND_DOCUMENT,
  ENV_KIND_KEY_RESULT,
  ENV_KIND_SCHEMA,
} from './kinds.js';

/**
 * The NekoEnv manifest.
 *
 * Reading model — same as NekoJSON's, restated here so this file is
 * self-describing for an auditor reading it cold:
 *
 *   - `entitlements.free` lists features that THIS BUILD ships with a
 *     working implementation. Phase 2.1 is engine-only, so the UI
 *     entitlements declared in the charter (view.table, view.text,
 *     view.diff, search, copy.key, copy.value, mask.value) are
 *     deliberately ABSENT from this list. They will be added in the
 *     Phase 2.2 UI PR, in the same commit that ships their
 *     implementation. Adding them now would be misleading advertising
 *     and would be caught by the monetization-safety conformance
 *     tests.
 *   - `entitlements.pro` lists features a future paid build will ship
 *     via a private `@nekotools-pro/*` package. They appear as honest
 *     intent advertising; the free build does not link any Pro
 *     implementation.
 *   - `capabilities.*` flags describe what THIS BUILD can do right
 *     now. `canSaveWorkspace`, `canExport`, and `canDiff` are true
 *     because the free build ships them; `canProjectGraph` is false
 *     because no graph projector is registered in the free build.
 *   - `parsers` / `exporters` / `graphProjectors` may list ids that
 *     are declared as Pro intent. The runtime registry only validates
 *     the forward direction (every *registered* implementation must
 *     be declared here); it does not require every declared id to be
 *     registered.
 *
 * The Phase 2.1 MVP free-tier set is asserted by the monetization-
 * safety tests in `__tests__/conformance.test.ts`.
 */
export const envManifest: ToolManifest = {
  version: 1,
  id: 'env',
  name: 'NekoEnv',
  toolVersion: 1,
  summary:
    'Inspect, validate, diff, and export local dotenv files. Phase 2 reuse-gate tool.',
  artifactKinds: [ENV_KIND_DOCUMENT, ENV_KIND_KEY_RESULT, ENV_KIND_SCHEMA, ENV_KIND_DIFF],
  parsers: ['env.text', 'env.key', 'env.diff.textual'],
  exporters: [
    'env.export.env.canonical',
    'env.export.env.example',
    'env.export.markdown.summary',
    'env.export.plaintext.keys',
    'env.export.schema.json-schema',
    'env.export.diff.textual',
    'env.export.types.typescript',
    'env.export.types.zod',
    'env.export.docs.data-dictionary',
    'env.export.compose.dotenv-stack',
  ],
  graphProjectors: ['env.graph.references'],
  offlinePolicy: DEFAULT_OFFLINE_POLICY,
  capabilities: {
    canSaveWorkspace: true,
    canExport: true,
    canDiff: true,
    canProjectGraph: false,
  },
  entitlements: {
    // Phase 2.1 engine-only free tier. UI entitlements (view.table,
    // view.text, view.diff, search, copy.key, copy.value, mask.value)
    // arrive in the Phase 2.2 UI PR, per the open-core governance
    // rule (free entitlements must be implementation-backed in the
    // same PR that adds them).
    free: [
      'parse',
      'format',
      'validate',
      'inspect.key',
      'schema.infer.basic',
      'diff.textual',
      'export.env.canonical',
      'export.env.example',
      'export.markdown.summary',
      'export.plaintext.keys',
      'export.schema.basic',
      'export.diff.textual',
      'workspace.save',
    ],
    pro: [
      'schema.infer.advanced',
      'secrets.scan',
      'diff.structural',
      'graph.references',
      'export.types.typescript',
      'export.types.zod',
      'export.docs.data-dictionary',
      'export.compose.dotenv-stack',
      'multi-env.compare',
    ],
  },
  outOfScope: [
    'fetching from remote secret stores (Vault, AWS SSM, Doppler, 1Password, etc.)',
    'variable interpolation or expansion of any kind ($VAR, ${VAR}, $(cmd))',
    'encryption or decryption of dotenv files (sops, git-crypt, dotenvx)',
    'executing scripts with --env-file or any other process spawning',
    'acting as a remote schema or secret registry',
    'streaming gigantic dotenv documents beyond the local soft threshold',
  ],
};
