# Release Checklist

How NekoTools gates releases. The **Current release-readiness gate** below is
the **active** gate for today's product surface. The **Phase 0 baseline**
further down is preserved as the historical Phase 0 record — it is no longer
the active release gate.

Status values: `PASS` / `PARTIAL` / `FAIL` / `N/A`, each with evidence.
A **blocker** must be `PASS` before the named release stage.

## Release stages — current status

| Stage | Status | Gate |
| ----- | ------ | ---- |
| `INTERNAL_DOGFOOD` | **READY** | sections 1–6 below all PASS |
| `LIMITED_PUBLIC_PREVIEW` | **BLOCKERS RESOLVED — pending confirming re-audit** | section 8 blockers all RESOLVED; a fresh release-readiness re-audit + owner disposition of the section-7 non-blocking risks is the remaining step |

Do not advertise `LIMITED_PUBLIC_PREVIEW` until a re-audit confirms this gate
and the owner has dispositioned the non-blocking risks in section 7.

## Current release-readiness gate (Phase 2 product surface)

Last reviewed: 2026-05-26 against `main` @ `11718bd` (release-readiness audit
+ the B1 / B2-D3 / B3 / B4-D4 follow-up PRs #56 / #57 / this PR).

### 1. Product surface / shipped tools

| Tool | Status | Evidence |
| ---- | ------ | -------- |
| NekoJSON | PASS — engine + UI free tier | `@nekotools/lens-json` + `apps/web-suite`; roadmap Phase 1 complete (PR #11) |
| NekoEnv | PASS — engine + UI free tier | `@nekotools/lens-env` + `apps/web-suite`; roadmap row 12 (PR #14) |
| NekoLogs | PASS — engine + UI free tier | `@nekotools/lens-logs` + `apps/web-suite`; roadmap row 15 (PR #54) |

Three tools are exposed as mounted tool tabs in `apps/web-suite`; each free
tier is implementation-backed and conformance-pinned.

### 2. Source-of-truth & docs accuracy

| Item | Status | Evidence |
| ---- | ------ | -------- |
| `docs/roadmap.md` canonical + current (rows 1–15 Done; queue empty) | PASS | roadmap + governance Rule 6 (PR #51) |
| `README.md` front door matches shipped product (3 tools, engine + UI) | PASS | PR #56 |
| Tool charters marked IMPLEMENTED + match code | PASS | `docs/tools/*.md` |
| No internal/phase copy in user-facing UI | PASS | PR #56 (`Now viewing …`) |
| No doc contradicts the canonical roadmap | PASS | drift sweep (PR #53) |

### 3. CI validation expectations

| Gate | Status | Evidence |
| ---- | ------ | -------- |
| `pnpm typecheck` / `lint` / `test` / `build` (`ci.yml`) | PASS | **557 tests** green on `main` |
| `pnpm offline-guard` (`offline-guard.yml`) | PASS | **0 violations** / 117 source files / 11 package.json |
| CI green on `main` HEAD | PASS | `ci` + `offline-guard` success |

Recommended **before** public preview (non-blocking, see section 7): e2e
smoke, automated accessibility (axe), bundle-size budget, Actions pinned by
SHA.

### 4. Offline / zero-telemetry posture

| Item | Status | Evidence |
| ---- | ------ | -------- |
| `network-forbidden` enforced in CI | PASS | `offline-guard` denylist + scan |
| No telemetry / analytics / CDN / `fetch` in product code | PASS | 0 violations |
| "Works in a bunker" end-to-end | MANUAL | documented in `docs/offline-policy.md`; not yet automated |

### 5. Monetization / entitlement consistency

| Item | Status | Evidence |
| ---- | ------ | -------- |
| Free entitlements implementation-backed + conformance-pinned | PASS | per-tool `conformance.test.ts` |
| Pro declared-but-not-registered (no Pro code in free build) | PASS | monetization-safety tests |
| `monetization-model.md` free/Pro boundary matches manifests | PASS | D3 (PR #57) — workspace save/load Free; advanced leverage Pro |

### 6. Claims / README copy safety

| Item | Status | Evidence |
| ---- | ------ | -------- |
| No "production / enterprise / release-ready / secure" overstatement in user-facing copy | PASS | README says "Phase 2 — active" |
| Offline / zero-telemetry / source-available claims are evidence-backed | PASS | offline-guard + LICENSE + `open-core-strategy.md` |

### 7. Known non-blocking risks (operational — owner disposition before public preview)

| Risk | Note |
| ---- | ---- |
| **F3** — `.github/dependabot.yml` present (weekly GitHub-Actions + npm/pnpm version checks); Dependabot **alerts** still require owner GitHub-UI enablement | config landed; offline-first + frozen lockfile + clean permissive licenses mitigate the residual |
| Branch protection unavailable (current plan) | no mechanical merge gate; relies on the PR + review discipline in `governance.md` |
| No e2e / a11y / bundle-size CI gate | strong component/integration coverage (557 tests) mitigates for dogfood |
| GitHub Actions pinned by tag, not SHA | supply-chain hardening; tracked below |

### 8. Public-preview blockers

| Blocker | Status |
| ------- | ------ |
| B1 — README understated shipped tools | RESOLVED (PR #56) |
| B2 / D3 — monetization free/Pro workspace boundary | RESOLVED (PR #57) |
| B3 — release-unsafe internal UI copy | RESOLVED (PR #56) |
| B4 / D4 — no current release-checklist gate | RESOLVED (this PR) |
| Confirming release-readiness re-audit | PENDING (run after this PR) |

All four substantive blockers (B1–B4) are resolved. `LIMITED_PUBLIC_PREVIEW`
remains gated on a confirming re-audit and the owner's disposition of the
section-7 non-blocking risks — it is **not** claimed here.

---

## Phase 0 baseline (historical — no longer the active gate)

Phase 0 baseline: **PASS** (historical). Preserved as the original
platform-spine acceptance record. The current gate above supersedes this as
the active release gate. Each Phase 0 criterion was mapped to the file or
test that proved it.

### Contracts

| Criterion                                       | Status  | Evidence |
| ----------------------------------------------- | ------- | -------- |
| Nine TS contracts exist                         | PASS    | `packages/contracts/src/{artifact,parser,diagnostic,export,workspace,graph,tool-manifest,entitlement,offline-policy}.contract.ts` |
| Every contract root carries a `version` field   | PASS    | `packages/contracts/src/version.ts` + each contract file |
| `CONTRACT_VERSION` pinned at `1`                | PASS    | `packages/contracts/src/version.ts` |
| Contract tests pass                             | PASS    | `packages/contracts/src/__tests__/contracts.test.ts` |

### Schemas

| Criterion                                                  | Status | Evidence |
| ---------------------------------------------------------- | ------ | -------- |
| Nine JSON Schemas exist                                    | PASS   | `packages/schemas/schemas/*.schema.json` |
| Every schema declares `$id` under `schemas.nekotools.local/` | PASS   | each schema's `$id` field |
| Every schema declares `version: { const: 1 }`              | PASS   | `packages/schemas/src/__tests__/schemas.test.ts` |
| Every schema has ≥1 valid and ≥1 invalid fixture           | PASS   | `packages/schemas/src/__tests__/fixtures.ts` |
| Schema validation tests pass                               | PASS   | `packages/schemas/src/__tests__/schemas.test.ts` |

### Runtime

| Criterion                                                                | Status | Evidence |
| ------------------------------------------------------------------------ | ------ | -------- |
| `ToolRegistry` rejects duplicate registrations                           | PASS   | `runtime.test.ts` |
| `ToolRegistry` rejects parsers/exporters not declared in the manifest    | PASS   | `runtime.test.ts` |
| `ToolRegistry.register` fails closed on schema-invalid manifest          | PASS   | `runtime.test.ts` |
| `ToolRegistry.register` fails closed on free/pro overlap                 | PASS   | `runtime.test.ts` |
| `runParser` converts thrown exceptions into error diagnostics            | PASS   | `runtime.test.ts` |
| `runParser` diagnostic IDs are deterministic                             | PASS   | `runtime.test.ts` |
| `runExporter` refuses unsupported artifact kinds                         | PASS   | `runtime.test.ts` |
| `jsonWorkspaceSerializer` round-trips losslessly                         | PASS   | `runtime.test.ts` |
| `jsonWorkspaceSerializer` refuses malformed / schema-invalid workspaces  | PASS   | `runtime.test.ts` |
| `validateManifest` flags features declared both free and pro             | PASS   | `runtime.test.ts` |
| `isFeatureAllowed` blocks Pro features under the free entitlement        | PASS   | `runtime.test.ts` |

### Offline guard

| Criterion                                                | Status | Evidence |
| -------------------------------------------------------- | ------ | -------- |
| Dependency + import/URL denylist exists                  | PASS   | `packages/offline-guard/src/denylist.ts` |
| Scanner skips `node_modules` and build artefacts         | PASS   | `scanner.test.ts` |
| Scanner flags banned deps / CDN imports / literal `fetch('https://…')` | PASS | `scanner.test.ts` |
| Scanner respects `offline-guard:allow` markers           | PASS   | `packages/offline-guard/src/scanner.ts` |
| `pnpm offline-guard` exits non-zero on violations        | PASS   | `packages/offline-guard/bin/offline-guard.js` |
| CI runs `offline-guard.yml`                              | PASS   | `.github/workflows/offline-guard.yml` |

### NekoBinary conformance lens

| Criterion                                                                 | Status | Evidence |
| ------------------------------------------------------------------------- | ------ | -------- |
| Five parsers: decimal, binary, hex, base64, utf8                          | PASS   | `packages/lens-binary/src/parsers.ts` |
| Parsers emit structured diagnostics instead of throwing                   | PASS   | `conformance.test.ts` |
| Three exporters: JSON, Markdown, plaintext                                | PASS   | `packages/lens-binary/src/exporters.ts` |
| Manifest passes `validateManifest`, declares `network-forbidden` + `outOfScope` | PASS | `conformance.test.ts` |
| End-to-end parser → diagnostic → export → workspace round-trip            | PASS   | `conformance.test.ts` |

### Documentation (Phase 0)

`product-doctrine.md`, `tool-charter.md`, `contract-versioning.md`,
`artifact-model.md`, `offline-policy.md`, `monetization-model.md`,
`open-core-strategy.md`, `roadmap.md`, and this file all existed and passed
Phase 0 review.

### Repo hygiene (Phase 0)

| Criterion                            | Status | Notes |
| ------------------------------------ | ------ | ----- |
| `pnpm install` succeeds              | PASS   | Lockfile committed; `--frozen-lockfile` works in CI. |
| `pnpm typecheck` / `lint` / `test` / `offline-guard` succeed | PASS | Phase 0 snapshot: 110 tests (contracts 6, schemas 58, runtime 20, offline-guard 6, lens-binary 20). **Current `main`: 557 tests — see the gate above.** |
| `README.md` explains scope           | PASS   | (kept current — see PR #56) |
| `LICENSE` clarifies trademark + commercial-use clause | PASS | source-available, not OSI — see `open-core-strategy.md` |

### Remaining hardening items (tracked)

| Item                                                  | Note |
| ----------------------------------------------------- | ---- |
| Pin GitHub Actions by SHA, not tag                    | Supply-chain hardening; still open (section 7). |
| Cross-runtime base64 adapter (not relying on global `atob`) | Node 20+ has it globally; revisit when shipping non-Node runtimes. |
| Decide canonical repo name | **Resolved: `NekoTools`.** Package name, git remote, and all docs use `NekoTools`; `NekoDevTools` survives only in pre-rename git history. |

### Phase 0 verification log (historical snapshot)

Local verification against the Phase 0 audit-patch commit `93efaa5`:

```
pnpm install         ok (frozen lockfile)
pnpm typecheck       ok (tsc -b)
pnpm test            110 tests passed
pnpm offline-guard   34 source files, 7 package.json, 0 violations
```

This is the Phase 0 snapshot. Current `main` verification (557 tests, 117
source files, 0 violations) is summarized in the gate above and runs green in
CI on every push/PR.

## Process expectations

Every change ships through the workflow in [governance.md](governance.md):

- branch off `main`
- commit on the branch
- open a PR
- CI must be green
- auditor reviews the PR diff
- merge only after explicit approval
- no direct-to-main, no transcript-only approvals, no phase advancement
  without a reviewable PR.
