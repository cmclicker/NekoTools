import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { COLOR_KIND_PARSED } from './kinds.js';

/**
 * The NekoColor manifest. Reading model matches the other lenses:
 * `entitlements.free` ships (engine + UI); `entitlements.pro` advertises a
 * future package, and the two Pro exporter ids are declared but NOT
 * registered (monetization-safety tests assert they throw "unknown
 * exporter"). Offline policy is `network-forbidden`.
 */
export const colorManifest: ToolManifest = {
  version: 1,
  id: 'color',
  name: 'NekoColor',
  toolVersion: 1,
  summary:
    'Parse and convert colors locally — hex / rgb() / hsl() / CSS names, normalized forms, and WCAG relative luminance + contrast vs white/black. Paste one per line.',
  artifactKinds: [COLOR_KIND_PARSED],
  parsers: ['color.text'],
  exporters: [
    'color.export.json',
    'color.export.normalized',
    'color.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'color.export.palette',
    'color.export.css-vars',
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
      'convert.hex',
      'convert.rgb',
      'convert.hsl',
      'inspect.contrast',
      'diagnostics.format',
      'export.json',
      'export.normalized',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'palette.generate',
      'scale.generate',
      'blend.mix',
      'contrast.pairwise-grid',
      'colorblind.simulate',
      'export.palette',
      'export.css-vars',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'wide-gamut / Lab / LCH / oklch color spaces (sRGB hex/rgb/hsl only)',
    'generating palettes, scales, or blends (Pro)',
    'colorblindness simulation and pairwise contrast grids (Pro)',
    'the full CSS named-color set (a common subset ships here)',
    'network access of any kind during inspection',
  ],
};
