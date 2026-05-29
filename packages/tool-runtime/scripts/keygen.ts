/**
 * Vendor keygen CLI (local-only, no network).
 *
 * Generates an Ed25519 signing keypair and, optionally, signs a license body
 * into a NekoTools license key. The PUBLIC key is embedded in the shipped
 * binary (`EMBEDDED_PUBLIC_KEY`); the PRIVATE key NEVER enters the repo —
 * keep it offline in the vendor's secret store. The matching public key is
 * what verifies every license the app ever sees.
 *
 * Usage (run with tsx from the repo root):
 *
 *   # 1. Mint a fresh signing identity (prints public + private key):
 *   pnpm --filter @nekotools/tool-runtime keygen
 *
 *   # 2. Sign a license with an existing private key:
 *   pnpm --filter @nekotools/tool-runtime keygen -- \
 *     --priv <base64-pkcs8> \
 *     --licensee "Ada Lovelace" --tier pro --features "*" --expires never
 *
 * Flags (all optional; sensible sample defaults if omitted):
 *   --priv <b64>       base64 PKCS8 private key to sign with (else a fresh
 *                      keypair is generated and its private key printed)
 *   --licensee <name>  name surfaced in the app as "Licensed to …"
 *   --license-id <id>  stable license id (default: random)
 *   --tier <tier>      free | pro | commercial (default: pro)
 *   --features <csv>   comma list, or "*" for everything (default: "*")
 *   --expires <when>   ISO date, or "never" (default: never)
 */

import {
  generateLicenseKeypair,
  signLicense,
} from '../src/license.js';
import type { Entitlement } from '@nekotools/contracts';

type LicenseBody = Omit<Entitlement, 'signature'>;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function main(): Promise<void> {
  let privateKey: CryptoKey;
  let publicKeyBase64: string;
  let privateKeyBase64: string | null = null;

  const privFlag = arg('priv');
  if (privFlag !== undefined) {
    privateKey = await crypto.subtle.importKey(
      'pkcs8',
      b64ToBytes(privFlag) as BufferSource,
      { name: 'Ed25519' },
      false,
      ['sign'],
    );
    // Public key cannot be derived from a non-extractable import; the caller
    // already has it from the original mint, so we don't reprint it here.
    publicKeyBase64 = '(supplied private key — public key printed at mint time)';
  } else {
    const pair = await generateLicenseKeypair();
    privateKey = pair.privateKey;
    publicKeyBase64 = pair.publicKeyBase64;
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    privateKeyBase64 = bytesToB64(pkcs8);
  }

  const tier = (arg('tier') ?? 'pro') as Entitlement['tier'];
  const featuresArg = arg('features') ?? '*';
  const features = featuresArg === '*' ? ['*'] : featuresArg.split(',').map((s) => s.trim());
  const expiresArg = arg('expires') ?? 'never';
  const expiresAt = expiresArg === 'never' ? null : new Date(expiresArg).toISOString();

  const body: LicenseBody = {
    version: 1,
    licenseId: arg('license-id') ?? `lic_${crypto.randomUUID().slice(0, 8)}`,
    licensee: arg('licensee') ?? 'NekoTools Sample',
    tier,
    features,
    issuedAt: new Date().toISOString(),
    expiresAt,
  };

  const licenseKey = await signLicense(body, privateKey);

  const out = {
    publicKeyBase64,
    privateKeyBase64,
    body,
    licenseKey,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  if (privateKeyBase64 !== null) {
    process.stderr.write(
      '\n[keygen] Store privateKeyBase64 OFFLINE. It never belongs in the repo.\n' +
        '[keygen] Embed publicKeyBase64 as EMBEDDED_PUBLIC_KEY in license.ts.\n',
    );
  }
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
});
