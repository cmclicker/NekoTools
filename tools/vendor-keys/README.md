# @nekotools/vendor-keys (owner-only)

License **minting** tooling for NekoTools. This package is **not shipped** and
**not bundled** into the app — it lives under `tools/` (not `packages/`)
precisely so the private-key-using signing code is walled off from the
source-available, shippable `packages/*`.

The two halves of the licensing pair:

| Half | Where | Uses |
| --- | --- | --- |
| **Verify** (ship side) | `@nekotools/tool-runtime` `verifyLicense` | the **public** key, embedded in the build |
| **Mint** (owner side) | this package | the **private** key, kept offline |

A NekoTools license key is `base64url(body).base64url(ed25519-signature)`,
where `body` is an `Entitlement` minus its signature. The app verifies it
locally on launch — no server, ever.

## One-time: create the production signing identity

```sh
pnpm --filter @nekotools/vendor-keys keygen
```

Prints `{ publicKeyBase64, privateKeyBase64 }`. Then:

1. **Embed the public key**: paste `publicKeyBase64` as `EMBEDDED_PUBLIC_KEY`
   in `packages/tool-runtime/src/license.ts`. This is safe to commit.
2. **Store the private key OFFLINE**: put `privateKeyBase64` in a password
   manager (1Password / Bitwarden) or an encrypted file. **Never** commit it,
   paste it into chat, or put it in unencrypted cloud storage.

If the private key ever leaks, anyone can mint free Pro keys. Recover by
minting a new identity and shipping the new public key (old keys stop
verifying).

## Per buyer: mint a founders key

```sh
NEKOTOOLS_PRIVATE_KEY="<base64-pkcs8 from keygen>" \
  pnpm --filter @nekotools/vendor-keys mint --licensee "Ada Lovelace"
```

Defaults mint a **founders** key: `tier: pro`, `features: ["*"]`, never expires
— "buy once, every current and future Pro feature, forever". The private key
is read from the env var (not a flag) so it stays out of shell history.

Output JSON includes `licenseKey` (give this to the buyer) and `body` (your
record). The buyer pastes the key once into the License tab; it unlocks the
whole suite offline, forever.

Flags: `--tier free|pro|commercial`, `--features "a,b"` or `*`,
`--expires <ISO>|never`, `--license-id <id>`.

## How a sale flows (serverless, matches the offline doctrine)

1. **Payment** — a hosted one-time-purchase link (e.g. Gumroad, Lemon
   Squeezy). They handle checkout, tax, receipts; you run no server.
2. **Delivery** — on payment you get the buyer's name → run `mint` locally →
   email the key (or paste it into the storefront's delivery field). Manual is
   fine for a founders alpha; automate later if volume warrants.
3. **Activation** — buyer pastes the key into the License tab. Verified
   offline, stored locally, unlocks Pro forever. Losing the local key never
   voids the purchase — re-deliver the same key.

## Library API

The CLIs are thin wrappers over `src/license-mint.ts`, which is unit-tested
(`mint → verifyLicense` round-trips with ephemeral keypairs):

- `generateSigningIdentity()` → `{ publicKeyBase64, privateKeyBase64 }`
- `importPrivateKey(b64Pkcs8)` → `CryptoKey`
- `mintLicense(privateKey, opts)` → `{ body, licenseKey }`
- `mintFoundersLicense(privateKey, licensee, extra?)` → founders-key shortcut
