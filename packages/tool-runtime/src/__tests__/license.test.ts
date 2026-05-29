import { describe, expect, it } from 'vitest';
import type { Entitlement } from '@nekotools/contracts';
import { FREE_ENTITLEMENT } from '@nekotools/contracts';

import {
  EntitlementError,
  generateLicenseKeypair,
  grantsFeature,
  signLicense,
  verifyLicense,
} from '../license.js';

const BODY = {
  version: 1 as const,
  licenseId: 'LIC-123',
  licensee: 'Ada Lovelace <ada@example.com>',
  tier: 'pro' as const,
  features: ['*'] as string[],
  issuedAt: '2026-05-01T00:00:00.000Z',
  expiresAt: null as string | null,
};

describe('license: sign + verify (offline Ed25519)', () => {
  it('verifies a license signed by the matching private key', async () => {
    const { privateKey, publicKeyBase64 } = await generateLicenseKeypair();
    const key = await signLicense(BODY, privateKey);
    const ent = await verifyLicense(key, publicKeyBase64);
    expect(ent.licensee).toBe('Ada Lovelace <ada@example.com>');
    expect(ent.tier).toBe('pro');
    expect(ent.signature.length).toBeGreaterThan(0);
  });

  it('rejects a key signed by a different key (forgery)', async () => {
    const a = await generateLicenseKeypair();
    const b = await generateLicenseKeypair();
    const key = await signLicense(BODY, a.privateKey);
    await expect(verifyLicense(key, b.publicKeyBase64)).rejects.toBeInstanceOf(EntitlementError);
  });

  it('rejects a tampered body', async () => {
    const { privateKey, publicKeyBase64 } = await generateLicenseKeypair();
    const key = await signLicense(BODY, privateKey);
    const [, sig] = key.split('.');
    // Re-encode a body that grants commercial tier, keep the old signature.
    const forgedBody = btoa(JSON.stringify({ ...BODY, tier: 'commercial' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    await expect(verifyLicense(`${forgedBody}.${sig}`, publicKeyBase64)).rejects.toBeInstanceOf(
      EntitlementError,
    );
  });

  it('rejects an expired license', async () => {
    const { privateKey, publicKeyBase64 } = await generateLicenseKeypair();
    const key = await signLicense({ ...BODY, expiresAt: '2020-01-01T00:00:00.000Z' }, privateKey);
    await expect(verifyLicense(key, publicKeyBase64)).rejects.toBeInstanceOf(EntitlementError);
  });

  it('accepts a not-yet-expired license against a fixed clock', async () => {
    const { privateKey, publicKeyBase64 } = await generateLicenseKeypair();
    const key = await signLicense({ ...BODY, expiresAt: '2030-01-01T00:00:00.000Z' }, privateKey);
    const ent = await verifyLicense(key, publicKeyBase64, new Date('2026-05-28T00:00:00.000Z'));
    expect(ent.licenseId).toBe('LIC-123');
  });

  it('rejects a malformed key', async () => {
    const { publicKeyBase64 } = await generateLicenseKeypair();
    await expect(verifyLicense('not-a-valid-key', publicKeyBase64)).rejects.toBeInstanceOf(
      EntitlementError,
    );
  });
});

describe('license: grantsFeature', () => {
  const proAll: Entitlement = { ...BODY, signature: 'x' };
  const proScoped: Entitlement = { ...BODY, features: ['secret.export.sarif'], signature: 'x' };

  it('free never grants Pro', () => {
    expect(grantsFeature(FREE_ENTITLEMENT, 'secret.export.sarif')).toBe(false);
  });
  it('wildcard grants everything', () => {
    expect(grantsFeature(proAll, 'anything.at.all')).toBe(true);
  });
  it('scoped grants only listed features', () => {
    expect(grantsFeature(proScoped, 'secret.export.sarif')).toBe(true);
    expect(grantsFeature(proScoped, 'secret.export.redacted')).toBe(false);
  });
});
