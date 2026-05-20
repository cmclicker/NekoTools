import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { JSON_KIND_DOCUMENT, JSON_KIND_PATH_RESULT, JSON_KIND_SCHEMA } from './kinds.js';

/**
 * The NekoJSON manifest, matching the charter draft (see
 * docs/tools/nekojson.md). The manifest is the canonical declaration
 * of intent: it lists every parser, exporter, projector, and entitlement
 * the tool will support — including Pro entries that ship in a future
 * private package.
 *
 * The free build registers only the free implementations. The runtime
 * registry validates that every *registered* parser/exporter is listed
 * here; it does not require that every listed entry be registered. So
 * Pro-declared entries are honest advertising — they cannot be invoked
 * by a free build that does not link the Pro module.
 */
export const jsonManifest: ToolManifest = {
  version: 1,
  id: 'json',
  name: 'NekoJSON',
  toolVersion: 1,
  summary:
    'Inspect, validate, navigate, and export local JSON documents. Phase 1 proof tool.',
  artifactKinds: [JSON_KIND_DOCUMENT, JSON_KIND_PATH_RESULT, JSON_KIND_SCHEMA, 'json.diff'],
  parsers: ['json.text', 'json.pointer'],
  exporters: [
    'json.export.json.pretty',
    'json.export.json.minified',
    'json.export.markdown.summary',
    'json.export.plaintext.paths',
    'json.export.schema.json-schema',
    'json.export.types.typescript',
    'json.export.types.zod',
    'json.export.docs.data-dictionary',
  ],
  graphProjectors: ['json.graph.references'],
  offlinePolicy: DEFAULT_OFFLINE_POLICY,
  capabilities: {
    canSaveWorkspace: true,
    canExport: true,
    canDiff: true,
    canProjectGraph: true,
  },
  entitlements: {
    free: [
      'parse',
      'format',
      'minify',
      'validate',
      'view.tree',
      'view.table',
      'view.text',
      'inspect.pointer',
      'search',
      'copy.path',
      'copy.value',
      'schema.infer.basic',
      'diff.textual',
      'export.json.pretty',
      'export.json.minified',
      'export.markdown.summary',
      'export.plaintext.paths',
      'export.schema.basic',
      'workspace.save',
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
