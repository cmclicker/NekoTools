import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { URL_KIND_PARSED } from './kinds.js';

/**
 * The NekoURL manifest.
 *
 * Reading model (same as the other lenses):
 *   - `entitlements.free` lists features this build ships with a working
 *     implementation. Because NekoURL ships as a vertical slice (engine +
 *     UI in one PR), the free list includes both the engine surfaces
 *     (parse, encode/decode, query normalization, security hints,
 *     exports) and the UI affordances (component inspector, copy) that
 *     are actually wired up here.
 *   - `entitlements.pro` is advertising for a future `@nekotools-pro/*`
 *     package; nothing Pro is bundled or registered. The two Pro exporter
 *     ids below are declared but intentionally NOT registered in the free
 *     build (the registry validates only the forward direction: every
 *     registered impl must be declared). The monetization-safety tests
 *     assert they throw "unknown exporter".
 *
 * Offline policy is the default `network-forbidden`: URL parsing is pure
 * string analysis with the platform `URL` API. NekoURL never resolves,
 * fetches, or follows anything — redirect-chain inspection is a locked
 * Pro placeholder precisely because it would require the network.
 */
export const urlManifest: ToolManifest = {
  version: 1,
  id: 'url',
  name: 'NekoURL',
  toolVersion: 1,
  summary:
    'Parse, inspect, and normalize URLs locally — component breakdown, query params, encode/decode, and security/privacy hints. No network, ever.',
  artifactKinds: [URL_KIND_PARSED],
  parsers: ['url.text'],
  exporters: [
    'url.export.params.json',
    'url.export.normalized',
    'url.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'url.export.batch.audit',
    'url.export.redaction.preset',
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
      'inspect.components',
      'encode.component',
      'decode.component',
      'normalize.query',
      'diagnostics.security',
      'export.params.json',
      'export.normalized',
      'export.markdown.summary',
      'copy.normalized',
      'workspace.save',
    ],
    pro: [
      'batch.audit',
      'profile.signed-link',
      'inspect.redirect-chain',
      'recipe.normalization',
      'policy.packs',
      'redaction.presets',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'following redirects or any network resolution of the URL',
    'DNS lookups, reachability, or TLS certificate inspection',
    'fetching the resource the URL points to',
    'IDN / punycode homograph-attack detection beyond what the platform URL parser does',
    'live link monitoring or durable storage',
  ],
};
