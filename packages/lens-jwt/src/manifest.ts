import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { JWT_KIND_DOCUMENT } from './kinds.js';

/**
 * The NekoJWT manifest (Wave 3 PR 2 Free MVP).
 *
 * Reading model:
 *   - `entitlements.free` lists features this build ships with a working
 *     implementation. UI features arrive with the UI PR.
 *   - `entitlements.pro` is advertising for a future `@nekotools-pro/*`
 *     package; nothing Pro is bundled here.
 *   - `exporters` may list Pro ids that are declared but NOT registered
 *     in the free build.
 */
export const jwtManifest: ToolManifest = {
  version: 1,
  id: 'jwt',
  name: 'NekoJWT',
  toolVersion: 1,
  summary: 'Decode and validate JWTs locally — structure validation, claim inspection, signature decode (not verify). Wave 3 JWT tool.',
  artifactKinds: [JWT_KIND_DOCUMENT],
  parsers: ['jwt.text'],
  exporters: [
    'jwt.export.header.json',
    'jwt.export.payload.json',
    'jwt.export.claims.table.json',
    'jwt.export.summary.markdown',
    // Pro — registered in this build but gated behind a valid entitlement.
    'jwt.export.claims.policy',
    'jwt.export.sarif',
  ],
  graphProjectors: [],
  offlinePolicy: DEFAULT_OFFLINE_POLICY,
  capabilities: {
    canSaveWorkspace: true,
    canExport: true,
    canDiff: false,
    canProjectGraph: false,
  },
  entitlements: {
    free: [
      'decode',
      'validate.structure',
      'validate.base64url',
      'parse.json',
      'interpret.time_claims',
      'export.header.json',
      'export.payload.json',
      'export.claims.table.json',
      'export.summary.markdown',
      'workspace.save',
      'signature.decode',
    ],
    pro: [
      'verify.jwks',
      'verify.offline.key',
      'policy.claims',
      'policy.issuer_audience',
      'export.sarif',
      'batch.audit',
      'recipes.saved',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'Signature verification (JWKS or offline public-key)',
    'Claim policy validation (issuer, audience, custom policies)',
    'Token refresh or expiration management',
    'Keyset discovery or JWK caching',
    'Batch token audit or recipe management',
  ],
};
