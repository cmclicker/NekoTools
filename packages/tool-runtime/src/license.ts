import type { Entitlement } from '@nekotools/contracts';
import { FREE_ENTITLEMENT } from '@nekotools/contracts';

/**
 * Offline license verification.
 *
 * A license key is `base64url(body) + "." + base64url(ed25519-signature)`,
 * where `body` is the JSON of an Entitlement minus its `signature`. The
 * signature is produced by the vendor's private key; the app verifies it
 * locally against an embedded public key. There is NO network call — a
 * purchased key, once pasted, unlocks Pro offline forever. Losing the local
 * key never voids the purchase: it is re-fetchable from the vendor portal.
 *
 * A determined user can patch the binary to bypass the gate (true of every
 * offline-licensed app); the goal is to make honest purchase the easy path,
 * not unbreakable DRM. The signed `licensee` is surfaced in the UI
 * ("Licensed to …") as social friction against key sharing.
 */

/** Thrown when a Pro feature is invoked without a valid entitlement. */
export class EntitlementError extends Error {
  constructor(
    message: string,
    readonly feature: string,
  ) {
    super(message);
    this.name = 'EntitlementError';
  }
}

/**
 * Production signing public key (Ed25519, raw, base64). Replace this with
 * the real key from `pnpm --filter @nekotools/vendor-keys keygen` before
 * shipping a paid build; the matching private key never enters the repo.
 */
export const EMBEDDED_PUBLIC_KEY = 'REPLACE_WITH_PRODUCTION_ED25519_PUBLIC_KEY_BASE64';

/** A license body is an Entitlement minus its signature. */
type LicenseBody = Omit<Entitlement, 'signature'>;

const UTF8 = new TextEncoder();
const UTF8_DEC = new TextDecoder();

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importPublicKey(material: string | CryptoKey): Promise<CryptoKey> {
  if (typeof material !== 'string') return material;
  return crypto.subtle.importKey('raw', b64UrlToBytes(material) as BufferSource, { name: 'Ed25519' }, false, ['verify']);
}

/**
 * Verify a license key and return the entitlement it grants. Throws
 * `EntitlementError` if the signature is invalid, the key is malformed, or
 * the license has expired. `publicKey` defaults to the embedded vendor key;
 * tests inject an ephemeral key.
 */
export async function verifyLicense(
  licenseKey: string,
  publicKey: string | CryptoKey = EMBEDDED_PUBLIC_KEY,
  now: Date = new Date(),
): Promise<Entitlement> {
  const parts = licenseKey.trim().split('.');
  if (parts.length !== 2) throw new EntitlementError('malformed license key', '*');

  const bodyBytes = b64UrlToBytes(parts[0]!);
  const sigBytes = b64UrlToBytes(parts[1]!);

  let key: CryptoKey;
  try {
    key = await importPublicKey(publicKey);
  } catch {
    throw new EntitlementError('invalid public key', '*');
  }

  const ok = await crypto.subtle.verify('Ed25519', key, sigBytes as BufferSource, bodyBytes as BufferSource);
  if (!ok) throw new EntitlementError('license signature does not verify', '*');

  let body: LicenseBody;
  try {
    body = JSON.parse(UTF8_DEC.decode(bodyBytes)) as LicenseBody;
  } catch {
    throw new EntitlementError('license body is not valid JSON', '*');
  }

  if (body.expiresAt !== null && Date.parse(body.expiresAt) <= now.getTime()) {
    throw new EntitlementError(`license expired on ${body.expiresAt}`, '*');
  }

  return { ...body, signature: parts[1]! };
}

/**
 * Sign a license body with an Ed25519 private key, producing a license key
 * string. Used by the owner-only `@nekotools/vendor-keys` mint tooling and by
 * tests; never shipped to the client (the client only ever verifies).
 */
export async function signLicense(body: LicenseBody, privateKey: CryptoKey): Promise<string> {
  const bodyBytes = UTF8.encode(JSON.stringify(body));
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, bodyBytes as BufferSource));
  return `${bytesToB64Url(bodyBytes)}.${bytesToB64Url(sig)}`;
}

/** Generate an Ed25519 keypair + the raw base64 public key (for keygen/tests). */
export async function generateLicenseKeypair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyBase64: string;
}> {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { publicKey: pair.publicKey, privateKey: pair.privateKey, publicKeyBase64: bytesToB64Url(raw) };
}

/**
 * Does this entitlement grant the named Pro feature/exporter id? A license
 * with `features: ['*']` grants everything in its tier; otherwise the
 * specific id must be listed. Free entitlements never grant Pro.
 */
export function grantsFeature(entitlement: Entitlement, feature: string): boolean {
  if (entitlement.tier === 'free') return false;
  return entitlement.features.includes('*') || entitlement.features.includes(feature);
}

export { FREE_ENTITLEMENT };
