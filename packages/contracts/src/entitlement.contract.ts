import type { ContractVersion } from './version.js';

/**
 * Entitlement — proof that a build is allowed to load a Pro module.
 *
 * Phase 0 ships only the contract. The verifier (Ed25519 signature check
 * over a canonical license body) lands when the first Pro module is
 * introduced in a paid build.
 *
 * The key architectural rule: Pro modules are not present in the public
 * free build. Entitlement is a gate for *module loading*, not for raw
 * user data. A user without an entitlement cannot trigger Pro features
 * because the Pro code is not in their binary at all.
 */
export interface Entitlement {
  readonly version: ContractVersion;
  readonly licenseId: string;
  readonly licensee: string;
  readonly tier: EntitlementTier;
  readonly features: readonly string[];
  readonly issuedAt: string;
  readonly expiresAt: string | null;
  readonly signature: string;
}

export type EntitlementTier = 'free' | 'pro' | 'commercial';

/**
 * The free build's entitlement: synthesized at startup, no signature
 * required, grants only `free`-tier features. Any code path that
 * requires a `pro` or `commercial` feature must fail closed when this
 * entitlement is active.
 */
export const FREE_ENTITLEMENT: Entitlement = {
  version: 1,
  licenseId: 'free',
  licensee: 'free build',
  tier: 'free',
  features: [],
  issuedAt: '1970-01-01T00:00:00.000Z',
  expiresAt: null,
  signature: '',
};
