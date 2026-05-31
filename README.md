# NekoTools

> Local-only, air-gapped-capable, zero-telemetry suite of visual developer workbenches.

NekoTools inspects, validates, explains, compares, transforms, and exports
technical artifacts without sending user data anywhere.

## Status

The platform spine is complete and the suite spans **35 local tools** across
DATA, WEB, TEXT, PROJECT, UTILITY, and SECURITY categories — all in one
offline build (breadth is the product: it works on a mountain, an island, or
the centre of the earth after the initial install). Every tool ships a full
free tier (engine + UI), and **all 35 also ship a Pro tier** — each tool's Pro
exporters are built to that tool's own manifest spec.

**The differentiated wedge is air-gapped security & DevSecOps.** CSP, cookie,
header, JWT, secret-leak, package, and license audits that run entirely in your
browser and **never phone home** — usable by teams (defense, finance,
healthcare) who cannot paste secrets or configs into a web tool. NekoSecrets is
the reference implementation (30 detection rules + entropy, masked findings,
local file load); see [docs/tool-standard.md](docs/tool-standard.md) and
[docs/tools/nekosecrets.md](docs/tools/nekosecrets.md).

**Monetization is live and offline.** Pro features ship in the single
source-available build and are gated at runtime behind a locally-verified
Ed25519 signed license key (`@nekotools/tool-runtime/license`): one unlock in
the suite header lights up every Pro tool, verified on launch against a bundled
public key — no account, no server, no network, ever. Keys are minted by the
owner-only `tools/vendor-keys` tooling. See
[docs/monetization-model.md](docs/monetization-model.md).

> Note: `docs/roadmap.md` predates the current breadth and is being
> superseded by per-tool charters under `docs/tools/` and the tool standard.

## Doctrine (the rules that cannot be bent)

1. No feature may require an internet connection to perform its primary function.
2. No telemetry. No analytics. No remote config. No hidden network calls.
3. No mandatory account. No cloud dependency. No feature degradation without internet.
4. Pro is gated at runtime by a locally-verified Ed25519 signed license — a
   single source-available build, no per-launch server check. (DRM is not the
   moat; real Pro value, signed/trusted distribution, and trademark are. See
   [docs/monetization-model.md](docs/monetization-model.md).)

See [docs/product-doctrine.md](docs/product-doctrine.md) for the full doctrine.

## Repo layout

```
apps/
  web-suite/              # unified offline web shell (all tool UIs + license badge)
packages/
  contracts/              # versioned TS contracts (artifact, parser, ...)
  schemas/                # JSON Schemas + valid/invalid fixtures
  tool-runtime/           # registry + runners + workspace serializer + offline license verify layer
  offline-guard/          # CI scanner enforcing the no-network rule
  lens-kit/               # shared clock + id-factory helper
  lens-binary/            # NekoBinary — the Phase 0 conformance lens
  lens-secrets/           # NekoSecrets — the reference tool (see docs/tool-standard.md)
  lens-<tool>/            # 35 tool engines total (json, env, logs, yaml, csv, jwt, url, hash, ...) — each with a free + Pro tier
tools/
  vendor-keys/            # OWNER-ONLY (not shipped): Ed25519 keygen + per-buyer license mint CLI
docs/                     # doctrine, charter, tool-standard, monetization, tools/*, etc.
examples/binary/          # canonical NekoBinary input/output fixtures
.github/workflows/        # CI (ci.yml + offline-guard.yml)
```

The shape of a finished tool — engine, monetization, UI, tests, docs — is
specified in [docs/tool-standard.md](docs/tool-standard.md), with NekoSecrets
as the reference implementation.

## Local development

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm offline-guard
```

## Acceptance criteria & release gate

See [docs/release-checklist.md](docs/release-checklist.md) — the current
release-readiness gate plus the Phase 0 baseline.

## How work moves through this repo

All changes ship via a branch + PR. See [docs/governance.md](docs/governance.md).

## License

See [LICENSE](LICENSE). The public core is **source-available**, not
OSI-approved open-source: non-commercial use is permitted; commercial
use, redistribution as a paid product, and use in a competing product
require a separate commercial license. The NekoTools name and marks are
trademarks and are not covered by the source license. See
[docs/open-core-strategy.md](docs/open-core-strategy.md) for the full
breakdown.
