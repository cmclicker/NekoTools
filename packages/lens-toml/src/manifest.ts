import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { TOML_KIND_PARSED } from './kinds.js';

/**
 * The NekoTOML manifest.
 *
 * Reading model (same as the other lenses):
 *   - `entitlements.free` lists features this build ships with a working
 *     implementation. NekoTOML ships as a vertical slice (engine + UI in
 *     one PR), so the free list includes both the engine surfaces (parse,
 *     inspect tree, diagnostics, exports) and the UI affordances (tree /
 *     JSON / normalized views, copy) actually wired up here.
 *   - `entitlements.pro` is advertising for a future `@nekotools-pro/*`
 *     package; nothing Pro is bundled or registered. The two Pro exporter
 *     ids below are declared but intentionally NOT registered in the free
 *     build (the registry validates only the forward direction: every
 *     registered impl must be declared). The monetization-safety tests
 *     assert they throw "unknown exporter".
 *
 * Offline policy is the default `network-forbidden`: TOML parsing is pure
 * string analysis. NekoTOML never fetches an `include`d file, resolves a
 * reference, or touches the network.
 */
export const tomlManifest: ToolManifest = {
  version: 1,
  id: 'toml',
  name: 'NekoTOML',
  toolVersion: 1,
  summary:
    'Parse, inspect, and normalize TOML locally — value tree, TOML↔JSON conversion, canonical re-serialization, and structural diagnostics. No network, ever.',
  artifactKinds: [TOML_KIND_PARSED],
  parsers: ['toml.text'],
  exporters: [
    'toml.export.json',
    'toml.export.normalized',
    'toml.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'toml.export.types',
    'toml.export.schema.json',
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
      'inspect.tree',
      'diagnostics.structure',
      'convert.json',
      'normalize.document',
      'export.json',
      'export.normalized',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'infer.types',
      'infer.schema',
      'semantic.diff',
      'migration.recipe',
      'batch.convert',
      'export.types',
      'export.schema.json',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'fetching, resolving, or following any path referenced inside the document',
    'multi-line basic/literal strings and multi-line arrays in this quick slice',
    'full RFC 3339 date-time typing (date-times are preserved as strings)',
    'arbitrary-precision integers beyond the JS safe-integer range',
    'network access of any kind during inspection',
  ],
};
