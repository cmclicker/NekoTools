import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { COOKIE_KIND_PARSED } from './kinds.js';

/**
 * The NekoCookies manifest.
 *
 * Reading model matches the other lenses: `entitlements.free` is what this
 * build actually ships (engine + UI); `entitlements.pro` is advertising
 * for a future `@nekotools-pro/*` package, and the two Pro exporter ids
 * are declared but NOT registered (monetization-safety tests assert they
 * throw "unknown exporter").
 *
 * Offline policy is `network-forbidden`. NekoCookies is a pure parser; it
 * never sets a cookie, contacts a domain, or checks the public-suffix
 * list over the network. Cookie values often contain session secrets, so
 * the tool keeps them local, masks them in the UI by default, and the
 * shareable markdown export reports value *length* only.
 */
export const cookiesManifest: ToolManifest = {
  version: 1,
  id: 'cookies',
  name: 'NekoCookies',
  toolVersion: 1,
  summary:
    'Inspect Set-Cookie / Cookie headers locally — attributes, expiry, and security/privacy hints (Secure, HttpOnly, SameSite, __Host-/__Secure- prefixes). Values stay on your machine.',
  artifactKinds: [COOKIE_KIND_PARSED],
  parsers: ['cookie.text'],
  exporters: [
    'cookie.export.json',
    'cookie.export.normalized',
    'cookie.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'cookie.export.audit.report',
    'cookie.export.policy.preset',
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
      'parse.set-cookie',
      'parse.cookie',
      'inspect.attributes',
      'diagnostics.security',
      'export.json',
      'export.normalized',
      'export.markdown.summary',
      'copy.output',
      'mask.value',
      'workspace.save',
    ],
    pro: [
      'audit.report',
      'policy.packs',
      'detect.tracking',
      'public-suffix.check',
      'compare.sets',
      'export.audit.report',
      'export.policy.preset',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'setting, sending, or storing cookies in a real browser jar',
    'public-suffix-list / eTLD+1 domain validation over the network',
    'tracking-cookie classification or third-party reputation lookups',
    'decrypting or validating signed/encrypted cookie values',
    'network access of any kind during inspection',
  ],
};
