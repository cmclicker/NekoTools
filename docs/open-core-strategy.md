# Open-Core Strategy

NekoTools is open-core with a **source-available** public core — not
OSI-approved open-source. The current `LICENSE` allows non-commercial
use; commercial use, redistribution as a paid product, or use in a
competing product requires a separate commercial license. We may
relicense the public core to an OSI-approved license (MPL-2.0 /
Apache-2.0) in the future; until then, do not describe the repo as
"open-source" in shipped material.

The architecture is built around the open-core split so that "flip a
flag to unlock Pro" is structurally impossible.

## Two repositories

- **`nekotools`** (this repo, public): free/core packages, public
  schemas, public UI shell, CLI basics, docs.
- **`nekotools-pro`** (private): Pro modules, advanced engines,
  migration studios, batch runners, advanced exporters, commercial
  policy packs.

The public repo can be cloned, forked (subject to the trademark clause
in `LICENSE`), and built. The free build it produces is genuinely
useful. The Pro implementation is not in it.

## Why not "free + entitlement flag"

Bad architecture:

```ts
if (user.isPro) enableProFeatures();
```

If `enableProFeatures` is in the public bundle, the flag is decorative.
A user changes the value, recompiles, and Pro is on. Entitlement
checks against in-bundle code are not monetization; they are a
suggestion.

## Build-time plugin registration

```ts
// free build (public repo)
const registeredPlugins = [
  jsonCorePlugin,
  envCorePlugin,
  logsCorePlugin,
];

// pro build (private repo, paid app)
const registeredPlugins = [
  jsonCorePlugin,
  envCorePlugin,
  logsCorePlugin,
  proGraphPlugin,        // not present in the free build
  proMigrationPlugin,    // not present in the free build
  proBatchRunnerPlugin,  // not present in the free build
];
```

The Pro symbols are imported from `@nekotools-pro/*` packages that the
free build does not have a dependency on. A user cannot flip a flag to
enable a module their binary does not contain.

## Manifest-level declarations

Every tool's `ToolManifest.entitlements` declares which features are
free and which are Pro. The free build can read those declarations —
that is fine, they are advertising material. What the free build
cannot do is *execute* a Pro feature, because the implementation lives
in a package it does not link against.

## CI guards

`@nekotools/offline-guard` is the public guard. A parallel
`@nekotools-pro/build-guard` (in the private repo) ensures the paid
build:

- Links exactly the declared Pro modules.
- Does not introduce telemetry packages.
- Bundles the entitlement verifier public key.
- Signs the release archive.

## What this does not protect against

- A determined reverse engineer patching the verifier in a paid build.
- A user redistributing a cracked binary.

The mitigations are:

- Distribute through trusted channels (App Stores, signed downloads).
- Commercial licensing for businesses, which carries real legal weight.
- Trademark protection on the name and marks.

Perfect DRM is not the goal. A clean separation between "free, public,
useful" and "Pro, private, paid" is.
