# Monetization Model

NekoTools monetizes through **open-core + paid Pro modules + offline
license files + paid signed builds + commercial licenses**. There is no
subscription tier in the consumer product. There is no server-side
license validation during normal use.

## What's free

- The source-available core packages (see
  [open-core-strategy.md](open-core-strategy.md) — the current LICENSE
  is source-available, not OSI-approved).
- Local parsing, validation, viewing, basic export.
- CLI basics.
- No account. No telemetry. No cloud dependency.

The free product is genuinely useful on its own. It is not a crippled
demo of the paid product.

## What's Pro

Pro is leverage, not access:

- Advanced visual engines (graph mode, semantic diff, migration studios).
- Batch processing.
- Advanced exports (diagrams, reports, documentation packs).
- Saved local workspaces, snapshots, recipes.
- Polished signed desktop / mobile builds.

Pro is a **one-time** purchase. No subscription. The user gets a
cryptographically signed offline license file that the app verifies
locally on each launch using a bundled public key. No server is
contacted.

## What's Commercial / Enterprise

For organizations:

- Offline license files for team distribution.
- Air-gapped installers.
- Internal redistribution rights.
- Custom policy packs.
- Commercial support, SLA, signed release archives.

This is where the air-gapped-capable positioning becomes
revenue-defining: regulated industries (defense, finance, healthcare,
government) actively need tools that demonstrably do not phone home.

## Why no subscriptions

Subscriptions psychologically and architecturally conflict with the
product doctrine:

- They imply ongoing validation, even if technically cached.
- They imply a server relationship the doctrine forbids.
- They erode the "works in a bunker for years" promise.

A one-time license that keeps working forever is more honest and aligns
with what users are actually paying for.

## What stops casual bypass

Not entitlement flags in source. Build-time separation:

- The Pro implementation is not present in the public free build.
- Flipping `hasPro = true` does nothing because the Pro modules are not
  bundled.
- The Ed25519-signed license verifies on launch with a public key
  bundled in the paid binary.

This stops casual tampering. It does not stop determined cracking, and
the business model does not depend on perfect DRM. It depends on:

- Real Pro value users want to pay for.
- Signed, trusted distribution.
- Trademark protection on the NekoTools name and marks.
- Commercial licensing for businesses that need legitimate use.

See [open-core-strategy.md](open-core-strategy.md) for the repo and
build-time architecture.
