import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { YAML_KIND_DOCUMENT, YAML_KIND_JSON_PROJECTION } from './kinds.js';

/**
 * The NekoYAML manifest (Phase 2B engine MVP).
 *
 * Reading model (same as the other lenses):
 *   - `entitlements.free` lists features THIS build ships with a working
 *     implementation. UI entitlements (view.tree / view.text / search /
 *     copy.*) are deliberately ABSENT — they arrive in the Wave 2 UI PR,
 *     in the same commit that ships them. Adding them now would be
 *     misleading advertising and is caught by the monetization-safety
 *     tests.
 *   - `entitlements.pro` is advertising for a future `@nekotools-pro/*`
 *     package; nothing Pro is bundled here.
 *   - `exporters` / `graphProjectors` may list Pro ids that are declared
 *     but NOT registered in the free build. The registry validates only
 *     the forward direction (every registered impl must be declared).
 */
export const yamlManifest: ToolManifest = {
  version: 1,
  id: 'yaml',
  name: 'NekoYAML',
  toolVersion: 1,
  summary:
    'Parse, validate, and convert YAML locally — tree, diagnostics, YAML/JSON conversion. Phase 2B breadth tool.',
  artifactKinds: [YAML_KIND_DOCUMENT, YAML_KIND_JSON_PROJECTION],
  parsers: ['yaml.text', 'yaml.from-json'],
  exporters: [
    'yaml.export.json',
    'yaml.export.json.min',
    'yaml.export.yaml.normalized',
    'yaml.export.paths',
    'yaml.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'yaml.export.schema.report',
    'yaml.export.roundtrip.diff',
  ],
  graphProjectors: ['yaml.graph.anchors'],
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
      'validate',
      'convert.yaml-to-json',
      'convert.json-to-yaml',
      'normalize',
      'export.paths',
      'export.markdown.summary',
      'workspace.save',
    ],
    pro: [
      'schema.validate',
      'diff.roundtrip',
      'policy.packs',
      'redaction.presets',
      'batch.validate',
      'recipe.saved',
      'workspace.snapshots',
      'graph.anchors',
    ],
  },
  outOfScope: [
    'Kubernetes / GitHub Actions / OpenAPI schema validation',
    'schema inference over YAML',
    'templating evaluation (Helm, Jinja, Go templates) or custom-tag code execution',
    'fetching anything referenced inside the YAML ($ref, URLs, !include)',
    'live file watching or durable storage',
  ],
};
