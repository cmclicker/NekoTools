import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { INI_KIND_PARSED } from './kinds.js';

/**
 * The NekoINI manifest. Reading model matches the other lenses:
 * `entitlements.free` ships (engine + UI); `entitlements.pro` advertises a
 * future package, and the two Pro exporter ids are declared but NOT
 * registered (monetization-safety tests assert they throw "unknown
 * exporter"). Offline policy is `network-forbidden`.
 */
export const iniManifest: ToolManifest = {
  version: 1,
  id: 'ini',
  name: 'NekoINI',
  toolVersion: 1,
  summary:
    'Parse and inspect INI / .properties / .editorconfig locally — sections, key=value / key:value, comments, duplicate diagnostics, and INI→JSON. Values stay raw strings.',
  artifactKinds: [INI_KIND_PARSED],
  parsers: ['ini.text'],
  exporters: [
    'ini.export.json',
    'ini.export.normalized',
    'ini.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'ini.export.env',
    'ini.export.toml',
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
      'inspect.sections',
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
      'convert.env',
      'convert.toml',
      'infer.types',
      'semantic.diff',
      'merge.files',
      'export.env',
      'export.toml',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'type coercion of values (INI values are kept as raw strings)',
    'nested/sub-section trees beyond a single section level',
    'INI dialect quirks: line continuations, inline comments, value quoting',
    'converting to .env / TOML with type inference (Pro)',
    'network access of any kind during inspection',
  ],
};
