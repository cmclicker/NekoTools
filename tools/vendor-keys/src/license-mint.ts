import { generateLicenseKeypair, signLicense } from '@nekotools/tool-runtime';
import type { Entitlement } from '@nekotools/contracts';

/**
 * Vendor-side license minting (OWNER-ONLY, local, no network).
 *
 * This module is the heart of `@nekotools/vendor-keys`. It is deliberately
 * NOT part of any shipped package: it uses the PRIVATE signing key to mint
 * license keys, which the client never sees. The client side only ever
 * *verifies* (see `@nekotools/tool-runtime`'s `verifyLicense` against the
 * embedded public key).
 *
 * Security contract:
 *   - The private key NEVER enters the repo. It is generated once
 *     (`generateSigningIdentity`), printed, and stored by the owner in an
 *     offline secret manager. It is supplied back to `mint*` as a base64
 *     PKCS8 string via a flag / env var at run time only.
 *   - The matching public key is embedded in the shipped build as
 *     `EMBEDDED_PUBLIC_KEY`; it is what verifies every license the app sees.
 */

export type LicenseBody = Omit<Entitlement, 'signature'>;

// --- base64 / PKCS8 helpers (Node + browser, no deps) ----------------------

export function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// --- signing identity ------------------------------------------------------

export interface SigningIdentity {
  /** Raw base64 Ed25519 public key — embed as `EMBEDDED_PUBLIC_KEY`. */
  readonly publicKeyBase64: string;
  /** base64 PKCS8 private key — store OFFLINE, never in the repo. */
  readonly privateKeyBase64: string;
}

/**
 * Mint a fresh Ed25519 signing identity. Run ONCE per signing key; keep the
 * private key offline and embed the public key in the shipped build.
 */
export async function generateSigningIdentity(): Promise<SigningIdentity> {
  const pair = await generateLicenseKeypair();
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  return { publicKeyBase64: pair.publicKeyBase64, privateKeyBase64: bytesToB64(pkcs8) };
}

/** Import a base64 PKCS8 private key for signing (non-extractable). */
export async function importPrivateKey(privateKeyBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    b64ToBytes(privateKeyBase64) as BufferSource,
    { name: 'Ed25519' },
    false,
    ['sign'],
  );
}

// --- minting ---------------------------------------------------------------

export interface MintOptions {
  /** Name surfaced in the app as "Licensed to …". */
  readonly licensee: string;
  /** Defaults to `pro`. */
  readonly tier?: Entitlement['tier'];
  /** Granted feature ids, or `['*']` for everything. Defaults to `['*']`. */
  readonly features?: readonly string[];
  /** ISO expiry, or null for never. Defaults to null (perpetual). */
  readonly expiresAt?: string | null;
  /** Stable license id. Defaults to a random `lic_xxxxxxxx`. */
  readonly licenseId?: string;
  /** Issue timestamp (ISO). Injectable for deterministic tests. */
  readonly issuedAt?: string;
  /** License id factory. Injectable for deterministic tests. */
  readonly newLicenseId?: () => string;
}

export interface MintResult {
  readonly body: LicenseBody;
  /** The signed key string the buyer pastes: `base64url(body).base64url(sig)`. */
  readonly licenseKey: string;
}

function randomLicenseId(): string {
  return `lic_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Sign a license body with an already-imported private key. Pure given its
 * inputs (timestamps/ids injectable), so it is unit-testable with an
 * ephemeral keypair.
 */
export async function mintLicense(privateKey: CryptoKey, opts: MintOptions): Promise<MintResult> {
  const body: LicenseBody = {
    version: 1,
    licenseId: opts.licenseId ?? (opts.newLicenseId ?? randomLicenseId)(),
    licensee: opts.licensee,
    tier: opts.tier ?? 'pro',
    features: opts.features !== undefined ? [...opts.features] : ['*'],
    issuedAt: opts.issuedAt ?? new Date().toISOString(),
    expiresAt: opts.expiresAt ?? null,
  };
  const licenseKey = await signLicense(body, privateKey);
  return { body, licenseKey };
}

/**
 * Mint a **founders** key: `tier: 'pro'`, `features: ['*']`, never expires —
 * the "buy once, every current and future Pro feature, forever" grant.
 * Convenience wrapper over `mintLicense` for the alpha's standard offer.
 */
export async function mintFoundersLicense(
  privateKey: CryptoKey,
  licensee: string,
  extra: Pick<MintOptions, 'licenseId' | 'issuedAt' | 'newLicenseId'> = {},
): Promise<MintResult> {
  return mintLicense(privateKey, {
    licensee,
    tier: 'pro',
    features: ['*'],
    expiresAt: null,
    ...extra,
  });
}
