/**
 * Vendor mint CLI (OWNER-ONLY, local, no network).
 *
 * Signs ONE license key for a buyer with your existing signing private key.
 * The private key is read from the NEKOTOOLS_PRIVATE_KEY env var (NOT a flag,
 * so it does not land in shell history). Defaults mint a FOUNDERS key:
 * tier=pro, features=*, never expires — "buy once, every current and future
 * Pro feature, forever".
 *
 * Usage (from the repo root):
 *   NEKOTOOLS_PRIVATE_KEY="<base64-pkcs8>" \
 *     pnpm --filter @nekotools/vendor-keys mint --licensee "Ada Lovelace"
 *
 * Flags (all optional except the licensee):
 *   --licensee <name>   REQUIRED — name surfaced in-app as "Licensed to …"
 *   --tier <tier>       free | pro | commercial   (default: pro)
 *   --features <csv>    comma list, or "*" for everything  (default: *)
 *   --expires <when>    ISO date, or "never"      (default: never)
 *   --license-id <id>   stable id                 (default: random lic_xxxxxxxx)
 *
 * Output: JSON with the signed `licenseKey` (give this to the buyer) and the
 * `body` it encodes (for your records). Deliver the key by email or via your
 * storefront's delivery field; the buyer pastes it into the License tab once.
 */

import type { Entitlement } from '@nekotools/contracts';
import { importPrivateKey, mintLicense, type MintOptions } from './license-mint.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const privB64 = process.env['NEKOTOOLS_PRIVATE_KEY'];
  if (privB64 === undefined || privB64.trim() === '') {
    process.stderr.write(
      '[mint] ERROR: set NEKOTOOLS_PRIVATE_KEY to your base64 PKCS8 signing key.\n' +
        '[mint] Generate one with `pnpm --filter @nekotools/vendor-keys keygen` (once),\n' +
        '[mint] then keep it OFFLINE and pass it only via this env var at mint time.\n',
    );
    process.exit(2);
    return;
  }

  const licensee = arg('licensee');
  if (licensee === undefined || licensee.trim() === '') {
    process.stderr.write('[mint] ERROR: --licensee "<name>" is required.\n');
    process.exit(2);
    return;
  }

  const featuresArg = arg('features') ?? '*';
  const expiresArg = arg('expires') ?? 'never';
  const licenseId = arg('license-id');
  const opts: MintOptions = {
    licensee,
    tier: (arg('tier') ?? 'pro') as Entitlement['tier'],
    features: featuresArg === '*' ? ['*'] : featuresArg.split(',').map((s) => s.trim()),
    expiresAt: expiresArg === 'never' ? null : new Date(expiresArg).toISOString(),
    // Only set licenseId when provided (exactOptionalPropertyTypes: no `undefined`).
    ...(licenseId !== undefined ? { licenseId } : {}),
  };

  const privateKey = await importPrivateKey(privB64);
  const result = await mintLicense(privateKey, opts);

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.stderr.write(
    `\n[mint] Minted a ${opts.tier} key for "${licensee}".\n` +
      '[mint] Give the buyer the `licenseKey` string above (email / storefront delivery).\n' +
      '[mint] They paste it once into the License tab; it verifies offline forever.\n',
  );
}

main().catch((err: unknown) => {
  process.stderr.write(String(err instanceof Error ? err.stack : err) + '\n');
  process.exit(1);
});
