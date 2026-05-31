import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { HASH_KIND_DIGEST, HASH_KIND_INPUT } from './kinds.js';

/**
 * The NekoHash manifest.
 *
 * Reading model (same as the other lenses):
 *   - `entitlements.free` lists features THIS build ships with a working
 *     implementation. NekoHash is a single vertical slice (engine + UI in
 *     one PR), so its free set covers both the engine digest and the UI
 *     affordances shipped here.
 *   - `entitlements.pro` advertises the Pro tier. The two declared Pro
 *     exporters (`hash.export.manifest`, `hash.export.checksum.profile`) are
 *     registered as gated `proExporters` in `buildHashRegistration`:
 *     `runExporter` refuses them without a valid entitlement and runs them
 *     for a Pro caller (single-build, entitlement-gated model — same as
 *     NekoTOML / NekoJSON). The remaining `entitlements.pro` ids stay
 *     advertising-only; they depend on future premium engines.
 *   - `exporters` lists every declared exporter id — free and Pro. The
 *     registry validates the forward direction (every registered impl must
 *     be declared).
 */
export const hashManifest: ToolManifest = {
  version: 1,
  id: 'hash',
  name: 'NekoHash',
  toolVersion: 1,
  summary:
    'Hash text and files locally with SHA-256/384/512 — hex + base64 digests, input byte length, and JSON/Markdown export. Local-only checksum utility.',
  artifactKinds: [HASH_KIND_INPUT, HASH_KIND_DIGEST],
  parsers: ['hash.text'],
  exporters: [
    'hash.export.digest',
    'hash.export.json',
    'hash.export.markdown.summary',
    // Pro — registered as gated `proExporters`; `runExporter` refuses them
    // without a valid entitlement (single-build, entitlement-gated model).
    'hash.export.manifest',
    'hash.export.checksum.profile',
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
      'hash.compute.text',
      'hash.compute.file',
      'algorithm.sha256',
      'algorithm.sha384',
      'algorithm.sha512',
      'digest.hex',
      'digest.base64',
      'export.digest',
      'export.json.summary',
      'export.markdown.summary',
    ],
    pro: [
      'manifest.batch',
      'verify.profiles',
      'bundle.signed',
      'workspace.snapshots',
      'compare.known-digest',
      'manifest.directory',
      'policy.packs',
    ],
  },
  outOfScope: [
    'password hashing / key-derivation functions (bcrypt, scrypt, argon2, PBKDF2)',
    'keyed hashing (HMAC), digital signatures, or any private-key operation',
    'encryption or decryption of any kind',
    'fetching remote files or URLs to hash — input is paste / import / file only',
    'collision-prone legacy digests (MD5, SHA-1) are intentionally excluded',
  ],
};
