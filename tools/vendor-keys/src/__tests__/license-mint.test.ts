import { describe, expect, it } from 'vitest';
import { generateLicenseKeypair, verifyLicense, grantsFeature } from '@nekotools/tool-runtime';

import {
  generateSigningIdentity,
  importPrivateKey,
  mintLicense,
  mintFoundersLicense,
  bytesToB64,
  b64ToBytes,
} from '../license-mint.js';

/**
 * The mint half must produce keys the ship-side `verifyLicense` accepts. These
 * tests use ephemeral keypairs (never a real signing key) and assert the full
 * round-trip: mint with the private key → verify with the matching public key.
 */

describe('vendor-keys: minting round-trips with verifyLicense', () => {
  it('a minted founders key verifies against the matching public key and grants everything', async () => {
    const pair = await generateLicenseKeypair();
    const { licenseKey, body } = await mintFoundersLicense(pair.privateKey, 'Ada Lovelace', {
      licenseId: 'lic_test001',
      issuedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(body).toMatchObject({
      tier: 'pro',
      features: ['*'],
      expiresAt: null,
      licensee: 'Ada Lovelace',
      licenseId: 'lic_test001',
    });

    const ent = await verifyLicense(licenseKey, pair.publicKeyBase64);
    expect(ent.tier).toBe('pro');
    expect(ent.licensee).toBe('Ada Lovelace');
    expect(ent.expiresAt).toBeNull();
    // A founders key grants every Pro feature, current and future.
    expect(grantsFeature(ent, 'json.export.types.typescript')).toBe(true);
    expect(grantsFeature(ent, 'some.future.pro.feature')).toBe(true);
  });

  it('a key minted with a DIFFERENT key does not verify (signature is real)', async () => {
    const signer = await generateLicenseKeypair();
    const attacker = await generateLicenseKeypair();
    const { licenseKey } = await mintFoundersLicense(signer.privateKey, 'Mallory');
    // Verifying against the wrong public key must throw.
    await expect(verifyLicense(licenseKey, attacker.publicKeyBase64)).rejects.toThrow();
  });

  it('mintLicense honors tier / features / expiry options', async () => {
    const pair = await generateLicenseKeypair();
    const { licenseKey, body } = await mintLicense(pair.privateKey, {
      licensee: 'Acme Corp',
      tier: 'commercial',
      features: ['json.export.types.typescript', 'env.export.types.zod'],
      expiresAt: '2030-01-01T00:00:00.000Z',
      licenseId: 'lic_acme',
      issuedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(body.tier).toBe('commercial');

    const ent = await verifyLicense(licenseKey, pair.publicKeyBase64);
    expect(ent.features).toEqual(['json.export.types.typescript', 'env.export.types.zod']);
    expect(grantsFeature(ent, 'json.export.types.typescript')).toBe(true);
    // Not a wildcard, so an unlisted feature is NOT granted.
    expect(grantsFeature(ent, 'env.export.compose.dotenv-stack')).toBe(false);
    expect(ent.expiresAt).toBe('2030-01-01T00:00:00.000Z');
  });

  it('an expired minted key is rejected by verifyLicense', async () => {
    const pair = await generateLicenseKeypair();
    const { licenseKey } = await mintLicense(pair.privateKey, {
      licensee: 'Expired Co',
      expiresAt: '2020-01-01T00:00:00.000Z',
      issuedAt: '2019-01-01T00:00:00.000Z',
      licenseId: 'lic_exp',
    });
    await expect(verifyLicense(licenseKey, pair.publicKeyBase64)).rejects.toThrow(/expired/);
  });

  it('generateSigningIdentity returns a usable keypair (mint → verify works)', async () => {
    const id = await generateSigningIdentity();
    expect(id.publicKeyBase64).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, raw key
    const priv = await importPrivateKey(id.privateKeyBase64);
    const { licenseKey } = await mintFoundersLicense(priv, 'Self Test', {
      licenseId: 'lic_self',
      issuedAt: '2026-01-01T00:00:00.000Z',
    });
    const ent = await verifyLicense(licenseKey, id.publicKeyBase64);
    expect(ent.tier).toBe('pro');
  });

  it('base64 helpers round-trip bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255]);
    expect([...b64ToBytes(bytesToB64(bytes))]).toEqual([...bytes]);
  });
});
