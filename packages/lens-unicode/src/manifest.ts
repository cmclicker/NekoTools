import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { UNICODE_KIND_PARSED } from './kinds.js';

/**
 * The NekoUnicode manifest. Reading model matches the other lenses:
 * `entitlements.free` ships (engine + UI); `entitlements.pro` advertises a
 * future package, and the two Pro exporter ids are declared but NOT
 * registered (monetization-safety tests assert they throw "unknown
 * exporter"). Offline policy is `network-forbidden`.
 */
export const unicodeManifest: ToolManifest = {
  version: 1,
  id: 'unicode',
  name: 'NekoUnicode',
  toolVersion: 1,
  summary:
    'Inspect text code point by code point locally — U+ hex, decimal, UTF-8/UTF-16 bytes, general category, and escape forms (\\u{}, &#;, %xx). No name database, no network.',
  artifactKinds: [UNICODE_KIND_PARSED],
  parsers: ['unicode.text'],
  exporters: [
    'unicode.export.json',
    'unicode.export.normalized',
    'unicode.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'unicode.export.names',
    'unicode.export.csv',
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
      'inspect.codepoints',
      'inspect.bytes',
      'inspect.category',
      'inspect.escapes',
      'diagnostics.text',
      'export.json',
      'export.normalized',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'lookup.names',
      'lookup.blocks',
      'detect.confusables',
      'detect.bidi',
      'normalize.nfc-nfd',
      'export.names',
      'export.csv',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'Unicode character names / block lookup (needs the UCD — Pro)',
    'confusable / homoglyph and bidi-control detection (Pro)',
    'NFC/NFD/NFKC normalization forms (Pro)',
    'grapheme-cluster segmentation (this inspects code points, not graphemes)',
    'network access of any kind during inspection',
  ],
};
