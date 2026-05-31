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
- Basic local workspace save / load — the Phase 0 workspace serializer;
  `workspace.save` ships free in every tool.
- CLI basics _(planned — no CLI ships yet)_.
- No account. No telemetry. No cloud dependency.

The free product is genuinely useful on its own. It is not a crippled
demo of the paid product.

## What's Pro

Pro is leverage, not access:

- Advanced visual engines (graph mode, semantic diff, migration studios).
- Batch processing.
- Advanced exports (diagrams, reports, documentation packs).
- Advanced workspace leverage: named snapshots, multi-workspace
  management, saved recipes, batch recipe execution, workspace packs,
  and signed / shareable workspace bundles. (Basic local save / load is
  free; team / commercial policy packs are in the Commercial / Enterprise
  tier below.)
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

**The shipped model is single-build, runtime-gated by a signed license** —
not build-time separation. Being precise about this matters, because an
honest description is the whole brand:

- There is **one** build. Each Pro feature's implementation (the gated
  exporters in `packages/lens-*/src/exporters.ts`, registered as
  `proExporters`) ships in that single build alongside the free features.
- The gate is at **runtime**: `runExporter` (in
  `packages/tool-runtime/src/runners.ts`) checks the active entitlement and
  throws `EntitlementError` for a Pro exporter unless the entitlement grants
  it. The free build runs under `FREE_ENTITLEMENT`, which grants nothing Pro.
- A purchased license is an **Ed25519-signed** offline key. The app verifies
  it locally on each launch against a bundled public key
  (`EMBEDDED_PUBLIC_KEY`) — see `packages/tool-runtime/src/license.ts`. No
  server is contacted, ever. One verified key lights up the whole suite,
  offline, forever.

Because the Pro code is present in the (source-available) build, a determined
user can patch the gate. **That is fine and expected** — the business model
has never depended on perfect DRM. The signed `licensee` is surfaced in the UI
("Licensed to …") as social friction against casual key-sharing. What the
model actually depends on:

- Real Pro value users want to pay for.
- Signed, trusted distribution (and, later, polished signed desktop builds).
- Trademark protection on the NekoTools name and marks.
- Commercial licensing for businesses that need legitimate use.

A future paid-binary variant **could** additionally strip the Pro
implementation out of a closed build (true build-time separation) for stronger
tamper-resistance; that is an option, not the current shipped architecture.

See [open-core-strategy.md](open-core-strategy.md) for the repo architecture.
