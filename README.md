# NekoTools

> Local-only, air-gapped-capable, zero-telemetry suite of visual developer workbenches.

NekoTools inspects, validates, explains, compares, transforms, and exports
technical artifacts without sending user data anywhere.

## Status

**Phase 2 — active.** The Phase 0 platform spine is complete, and three tools
have shipped their full free tier (engine + UI):

- **NekoJSON** — JSON workbench: parse / validate / format, tree / text /
  table views, search, copy. Phase 1, complete.
- **NekoEnv** — `.env` workbench: parse / validate / diff, table / text /
  diff views, search, copy, value masking. Phase 2, complete.
- **NekoLogs** — log workbench: parse / filter / summary / histogram,
  table / text / summary views, structured filter, search, copy.
  Phase 2, complete.

`docs/roadmap.md` is the **canonical source of truth** for current status and
the work queue — consult it for the authoritative phase/PR state.

## Doctrine (the rules that cannot be bent)

1. No feature may require an internet connection to perform its primary function.
2. No telemetry. No analytics. No remote config. No hidden network calls.
3. No mandatory account. No cloud dependency. No feature degradation without internet.
4. Pro modules are not present in the public repo. They live in a separate
   private package set and are linked into paid builds at build time.

See [docs/product-doctrine.md](docs/product-doctrine.md) for the full doctrine.

## Repo layout

```
apps/
  web-suite/              # unified offline web shell (NekoJSON + NekoEnv + NekoLogs UIs)
packages/
  contracts/              # versioned TS contracts (artifact, parser, ...)
  schemas/                # JSON Schemas + valid/invalid fixtures
  tool-runtime/           # registry + runners + workspace serializer
  offline-guard/          # CI scanner enforcing the no-network rule
  lens-kit/               # shared clock + id-factory helper
  lens-binary/            # NekoBinary — the Phase 0 conformance lens
  lens-json/              # NekoJSON engine
  lens-env/               # NekoEnv engine
  lens-logs/              # NekoLogs engine
docs/                     # doctrine, charter, versioning, roadmap, etc.
examples/binary/          # canonical NekoBinary input/output fixtures
.github/workflows/        # CI (ci.yml + offline-guard.yml)
```

## Local development

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm offline-guard
```

## Phase 0 acceptance criteria

See [docs/release-checklist.md](docs/release-checklist.md).

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
