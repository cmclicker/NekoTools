import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { CASE_KIND_PARSED } from './kinds.js';

/**
 * The NekoCase manifest. Reading model matches the other lenses:
 * `entitlements.free` ships (engine + UI); `entitlements.pro` advertises a
 * future package, and the two Pro exporter ids are declared but NOT
 * registered (monetization-safety tests assert they throw "unknown
 * exporter"). Offline policy is `network-forbidden`.
 */
export const caseManifest: ToolManifest = {
  version: 1,
  id: 'case',
  name: 'NekoCase',
  toolVersion: 1,
  summary:
    'Convert text and identifiers between cases locally — camelCase, PascalCase, snake_case, CONSTANT_CASE, kebab-case, Title Case, dot.case, and slug. Paste one phrase per line.',
  artifactKinds: [CASE_KIND_PARSED],
  parsers: ['case.text'],
  exporters: [
    'case.export.json',
    'case.export.normalized',
    'case.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'case.export.csv',
    'case.export.single-form',
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
      'transform',
      'tokenize',
      'inspect.forms',
      'diagnostics.tokens',
      'export.json',
      'export.normalized',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ],
    pro: [
      'custom.acronyms',
      'unicode.transliterate',
      'batch.rename',
      'pick.single-form',
      'export.csv',
      'export.single-form',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'Unicode transliteration / accent folding for slugs (ASCII-ish heuristics only)',
    'custom acronym dictionaries (e.g. keeping "URL" together) — Pro',
    'pluralization, stemming, or other linguistic transforms',
    'locale-aware casing rules (uses default JS upper/lower casing)',
    'network access of any kind during inspection',
  ],
};
