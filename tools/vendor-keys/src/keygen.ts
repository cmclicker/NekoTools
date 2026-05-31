/**
 * Vendor keygen CLI (OWNER-ONLY, local, no network).
 *
 * Mints a FRESH Ed25519 signing identity. Run this ONCE to create the
 * production signing key. It prints both keys to stdout as JSON:
 *   - `publicKeyBase64`  → embed as `EMBEDDED_PUBLIC_KEY` in
 *                          `packages/tool-runtime/src/license.ts`
 *   - `privateKeyBase64` → store OFFLINE in a secret manager; NEVER commit it,
 *                          paste it into chat, or put it in cloud storage.
 *
 * If the private key ever leaks, anyone can mint free Pro keys — rotate by
 * minting a new identity and shipping the new public key.
 *
 * Usage (from the repo root):
 *   pnpm --filter @nekotools/vendor-keys keygen
 *
 * To then sign a license with that key, use `mint` (see mint.ts), passing the
 * private key via the NEKOTOOLS_PRIVATE_KEY env var.
 */

import { generateSigningIdentity } from './license-mint.js';

async function main(): Promise<void> {
  const identity = await generateSigningIdentity();
  process.stdout.write(JSON.stringify(identity, null, 2) + '\n');
  process.stderr.write(
    '\n[keygen] A fresh signing identity was minted.\n' +
      '[keygen] 1. Embed publicKeyBase64 as EMBEDDED_PUBLIC_KEY in\n' +
      '[keygen]    packages/tool-runtime/src/license.ts (this is safe to commit).\n' +
      '[keygen] 2. Store privateKeyBase64 OFFLINE (password manager / encrypted file).\n' +
      '[keygen]    It NEVER belongs in the repo, chat, or unencrypted cloud storage.\n' +
      '[keygen] 3. Mint buyer keys with:  NEKOTOOLS_PRIVATE_KEY=<priv> pnpm --filter\n' +
      '[keygen]    @nekotools/vendor-keys mint --licensee "Buyer Name"\n',
  );
}

main().catch((err: unknown) => {
  process.stderr.write(String(err instanceof Error ? err.stack : err) + '\n');
  process.exit(1);
});
