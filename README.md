# NekoTools

> Local-only, air-gapped-capable, zero-telemetry suite of visual developer workbenches.

NekoTools inspects, validates, explains, compares, transforms, and exports
technical artifacts without sending user data anywhere.

## Status

**Phase 0 — Platform spine.** Not a product yet. This phase builds the
contracts, schemas, runtime skeleton, offline guardrails, and one trivial
conformance lens (NekoBinary) that proves the architecture works end-to-end.

NekoJSON, the first real product tool, is Phase 1 and is not in this repo yet.

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
  web-suite/              # placeholder for the unified web shell
packages/
  contracts/              # versioned TS contracts (artifact, parser, ...)
  schemas/                # JSON Schemas + valid/invalid fixtures
  tool-runtime/           # registry + runners + workspace serializer
  offline-guard/          # CI scanner enforcing the no-network rule
  lens-binary/            # NekoBinary — the Phase 0 conformance lens
docs/                     # doctrine, charter, versioning, roadmap, etc.
examples/binary/          # canonical NekoBinary input/output fixtures
.github/workflows/        # CI
```

## Local development

```bash
pnpm install
pnpm test
pnpm lint
pnpm offline-guard
```

## Phase 0 acceptance criteria

See [docs/release-checklist.md](docs/release-checklist.md).

## License

See [LICENSE](LICENSE). The NekoTools name and marks are not covered by the
source license.
