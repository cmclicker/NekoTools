# Release Checklist

Phase 0 status: **PASS** (subject to remaining hardening items below).

Each acceptance criterion is mapped to the file or test that proves it.
"Status" is the result of the most recent local verification run.

## Contracts

| Criterion                                       | Status  | Evidence |
| ----------------------------------------------- | ------- | -------- |
| Nine TS contracts exist                         | PASS    | `packages/contracts/src/{artifact,parser,diagnostic,export,workspace,graph,tool-manifest,entitlement,offline-policy}.contract.ts` |
| Every contract root carries a `version` field   | PASS    | `packages/contracts/src/version.ts` + each contract file |
| `CONTRACT_VERSION` pinned at `1`                | PASS    | `packages/contracts/src/version.ts` |
| Contract tests pass                             | PASS    | `packages/contracts/src/__tests__/contracts.test.ts` (6/6) |

## Schemas

| Criterion                                                  | Status | Evidence |
| ---------------------------------------------------------- | ------ | -------- |
| Nine JSON Schemas exist                                    | PASS   | `packages/schemas/schemas/*.schema.json` |
| Every schema declares `$id` under `schemas.nekotools.local/` | PASS   | each schema's `$id` field |
| Every schema declares `version: { const: 1 }`              | PASS   | `packages/schemas/src/__tests__/schemas.test.ts` (loops every schema) |
| Every schema has ≥1 valid and ≥1 invalid fixture           | PASS   | `packages/schemas/src/__tests__/fixtures.ts` |
| Schema validation tests pass                               | PASS   | `packages/schemas/src/__tests__/schemas.test.ts` (58/58) |

## Runtime

| Criterion                                                                | Status | Evidence |
| ------------------------------------------------------------------------ | ------ | -------- |
| `ToolRegistry` rejects duplicate registrations                           | PASS   | `runtime.test.ts` — "rejects duplicate registration" |
| `ToolRegistry` rejects parsers/exporters not declared in the manifest    | PASS   | `runtime.test.ts` — "rejects a parser whose toolId does not match" / "rejects an exporter not declared" |
| `ToolRegistry.register` fails closed on schema-invalid manifest          | PASS   | `runtime.test.ts` — "fails closed on a schema-invalid manifest" |
| `ToolRegistry.register` fails closed on free/pro overlap                 | PASS   | `runtime.test.ts` — "fails closed on a cross-field-invalid manifest" |
| `runParser` converts thrown exceptions into error diagnostics            | PASS   | `runtime.test.ts` — "converts thrown errors into diagnostics" |
| `runParser` diagnostic IDs are deterministic                             | PASS   | `runtime.test.ts` — "produces a deterministic diagnostic id" |
| `runParser` accepts an injected ID factory                               | PASS   | `runtime.test.ts` — "lets callers override the diagnostic id factory" |
| `runExporter` refuses unsupported artifact kinds                         | PASS   | `runtime.test.ts` — "refuses unsupported artifact kinds" |
| `jsonWorkspaceSerializer` round-trips losslessly                         | PASS   | `runtime.test.ts` — "round-trips a valid workspace" |
| `jsonWorkspaceSerializer.deserialize` refuses malformed JSON             | PASS   | `runtime.test.ts` — "refuses malformed JSON on load" |
| `jsonWorkspaceSerializer.serialize` refuses schema-invalid workspaces    | PASS   | `runtime.test.ts` — "refuses schema-invalid workspaces on save" |
| `validateManifest` flags features declared both free and pro             | PASS   | `runtime.test.ts` — "rejects a feature that is both free and pro" |
| `isFeatureAllowed` blocks Pro features under the free entitlement        | PASS   | `runtime.test.ts` — "blocks pro features under the free entitlement" |

## Offline guard

| Criterion                                                | Status | Evidence |
| -------------------------------------------------------- | ------ | -------- |
| Dependency denylist exists                               | PASS   | `packages/offline-guard/src/denylist.ts` |
| Import / URL denylist exists                             | PASS   | `packages/offline-guard/src/denylist.ts` |
| Scanner skips `node_modules` and build artefacts         | PASS   | `scanner.test.ts` — "skips node_modules" |
| Scanner flags banned dependencies                        | PASS   | `scanner.test.ts` — "flags a forbidden dependency" / "forbidden dev dependency" |
| Scanner flags external CDN imports                       | PASS   | `scanner.test.ts` — "flags a remote CDN reference" |
| Scanner flags literal `fetch('https://...')` calls       | PASS   | `scanner.test.ts` — "flags a literal fetch() to an external URL" |
| Scanner respects `offline-guard:allow` markers           | PASS   | `packages/offline-guard/src/scanner.ts` (`ALLOW_MARKER`) |
| `pnpm offline-guard` exits non-zero on violations        | PASS   | `packages/offline-guard/bin/offline-guard.js` |
| CI runs `offline-guard.yml`                              | PASS   | `.github/workflows/offline-guard.yml` |

## NekoBinary conformance lens

| Criterion                                                                 | Status | Evidence |
| ------------------------------------------------------------------------- | ------ | -------- |
| Five parsers: decimal, binary, hex, base64, utf8                          | PASS   | `packages/lens-binary/src/parsers.ts` |
| Parsers emit structured diagnostics instead of throwing on malformed input | PASS  | `conformance.test.ts` — every parser has a "diagnostic for invalid input" case |
| Three exporters: JSON, Markdown, plaintext                                | PASS   | `packages/lens-binary/src/exporters.ts` |
| Manifest passes `validateManifest`                                        | PASS   | `conformance.test.ts` — "passes schema + cross-field validation" |
| Manifest declares `networkPolicy: 'network-forbidden'`                    | PASS   | `conformance.test.ts` — "declares network-forbidden" |
| Manifest declares zero Pro features (Phase 0)                             | PASS   | `conformance.test.ts` — same test |
| Manifest declares an explicit `outOfScope`                                | PASS   | `conformance.test.ts` — "declares an explicit outOfScope" |
| End-to-end parser → diagnostic → export → workspace round-trip            | PASS   | `conformance.test.ts` — exporter + workspace tests |

## Documentation

| File                              | Status | Notes |
| --------------------------------- | ------ | ----- |
| `docs/product-doctrine.md`        | PASS   |       |
| `docs/tool-charter.md`            | PASS   | 10-question reuse gate documented |
| `docs/contract-versioning.md`     | PASS   |       |
| `docs/artifact-model.md`          | PASS   |       |
| `docs/offline-policy.md`          | PASS   | Includes `offline-guard:allow` marker review rule |
| `docs/monetization-model.md`      | PASS   | License language: source-available core |
| `docs/open-core-strategy.md`      | PASS   | License language: source-available core |
| `docs/roadmap.md`                 | PASS   |       |
| `docs/release-checklist.md`       | PASS   | This file. |

## Repo hygiene

| Criterion                            | Status | Notes |
| ------------------------------------ | ------ | ----- |
| `pnpm install` succeeds              | PASS   | Lockfile committed. `--frozen-lockfile` works in CI. |
| `pnpm typecheck` succeeds            | PASS   | `tsc -b` from root, propagates project refs. |
| `pnpm test` succeeds                 | PASS   | 110 tests (contracts 6, schemas 58, runtime 20, offline-guard 6, lens-binary 20). |
| `pnpm lint` succeeds                 | PASS   | ESLint config at root. |
| `pnpm offline-guard` succeeds        | PASS   | 0 violations. |
| `README.md` explains scope           | PASS   |       |
| `LICENSE` clarifies trademark + commercial-use clause | PASS | Repo is source-available, not OSI open-source — see [open-core-strategy.md](open-core-strategy.md). |

## Remaining hardening items (not blockers)

| Item                                                  | Why it's not Phase 0-blocking |
| ----------------------------------------------------- | ----------------------------- |
| Pin GitHub Actions by SHA, not tag                    | Hardening for trust posture; current pinning is the workspace norm. Track for Phase 1+. |
| Cross-runtime base64 adapter (not relying on global `atob`) | Node 20+ has it globally; revisit when shipping non-Node runtimes. |
| Decide canonical repo name (`NekoTools` vs `NekoDevTools`) | Branding decision; not a code issue. |

## Verification log

Most recent local run, recorded against commit `41a59bc` plus the Phase 0
patch set on top:

```
pnpm install         ok (frozen lockfile)
pnpm typecheck       ok (tsc -b)
pnpm test            110 tests passed
pnpm offline-guard   34 source files, 7 package.json, 0 violations
```

When CI publishes a green run on the merge commit, replace this block
with the workflow URL.
