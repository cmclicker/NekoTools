# Roadmap

> See [governance.md](governance.md) for how phases advance and how
> work is reviewed.

## Status board

| Phase   | State                       | Notes |
| ------- | --------------------------- | ----- |
| Phase 0   | **Complete** (commit `93efaa5`) | Platform spine + audit patches landed. |
| Phase 1.0 | **Complete** (PR #2, commit `324115c`) | Engine MVP merged. No UI, no diff, no search — those land in Phase 1.1+ follow-up PRs. |
| Phase 1.1 | **Active**                  | Follow-up engine + UI capabilities. See **Active Next Queue** below. |
| Phase 2   | Not started                 | Fast adjacent tools. |
| Phase 3   | Not started                 | Premium engines (graph, semantic diff, migration). |
| Phase 4   | Not started                 | Heavier tools (YAML, API Lens, Headers, Types, RBAC). |
| Phase 5   | Not started                 | Expansion packs. |

## Active Next Queue

The next PR is **always** the lowest-numbered row whose Status is `Next`
or `Queued`. The assistant/dev agent reads this table after every merge,
proposes the branch + PR scope, and starts work without asking — see
[`governance.md`](governance.md) and the "Post-merge default" rule.

A row moves to `Done` when its PR merges. The next-up row's Status
flips from `Queued` to `Next` in the same closeout PR that marks the
previous row `Done`.

| Order | Phase     | PR Type        | Scope                                                                                          | Status |
| ----- | --------- | -------------- | ---------------------------------------------------------------------------------------------- | ------ |
| 1     | Phase 1.0 Closeout | Docs       | Mark PR #2 / `324115c` as complete; add this Active Next Queue; set Phase 1.1a as next. | Done (PR #3 / `0f7c0a2`) |
| 2     | Phase 1.1a | Implementation | `json.diff` artifact + basic textual diff exporter. Still engine-only; validates the multi-document workspace assumptions. | Done (PR #4 / `819f4bb`) |
| 3     | Phase 1.1b | Implementation | Large-document soft threshold + `json.large_document` diagnostic.                              | Done (PR #5 / `6e5b639`) |
| 4     | Phase 1.1c | Planning + Implementation | In-tree tokenizer foundation (always-accurate spans).                              | Done (PR #6 / `4089554`) |
| 5     | Phase 1.1d | Implementation | `json.duplicate_key` + `json.trailing_comma` diagnostics using the new tokenizer.              | Done (PR #7 / `6a230f0`) |
| 6     | Phase 1.1e | UI Planning + Shell | `apps/web-suite` shell scaffold + UI charter; manifest-summary panel. Views/search/copy queued as 1.1f–h. | Done (this PR) |
| 7     | Phase 1.1f | Implementation | NekoJSON **tree view** + **text view** + flip `view.tree` / `view.text` into `entitlements.free`. | **Next** |
| 8     | Phase 1.1g | Implementation | NekoJSON **table view** + **search** across keys/values + flip `view.table` / `search` into `entitlements.free`. | Queued |
| 9     | Phase 1.1h | Implementation | **Copy.path** + **copy.value** affordances + flip both into `entitlements.free`.               | Queued |
| 10    | Phase 2.0  | Charter        | NekoEnv charter PR (10-question reuse gate).                                                   | Later  |

`Later` rows are intentionally not in the queue order — they are
candidates for promotion to `Queued` after Phase 1 is fully closed.

## Phase 0 — Platform spine — COMPLETE

Built the minimum real NekoTools spine that proves the architecture is
not theoretical.

Phase 0 was complete when:

- contracts exist (versioned, TypeScript)
- schemas validate (JSON Schema, with valid + invalid fixtures)
- docs explain them
- tests enforce them
- one trivial conformance lens (NekoBinary) runs through the full pipeline
- CI blocks network/telemetry violations

### Phase 0 substages

- **0.1 — Repo foundation.** pnpm monorepo, TypeScript, Vitest, ESLint,
  Prettier, CI skeleton.
- **0.2 — Contracts.** Nine versioned TS contracts. Artifact first.
- **0.3 — Schemas + fixtures.** Nine JSON Schemas. Valid + invalid
  fixtures. Schema validation tests.
- **0.4 — Runtime spine.** Tool registry, parser runner, export runner,
  workspace serializer, manifest validator, entitlement gate.
- **0.5 — Offline guard.** Dependency denylist, URL/import scanner,
  CI integration.
- **0.6 — NekoBinary conformance lens.** Parser → diagnostic → export
  → workspace, end-to-end.
- **0.7 — Documentation hardening.** Doctrine, charter, versioning,
  artifact model, offline policy, monetization, open-core, roadmap,
  release checklist.

## Active: Phase 1 — NekoJSON proof tool

Not flagship. Proof-grade. One tool, done well, that validates the
spine generalizes from a trivial conformance lens to a real product
tool.

**Charter:** [docs/tools/nekojson.md](tools/nekojson.md).

### Phase 1.0 — Engine MVP (shipped, PR #2)

Engine-only, no UI. The features below are implementation-backed in
`@nekotools/lens-json` and declared in `manifest.entitlements.free`:

- parse / validate / format / minify
- JSON Pointer (`json.pointer`) inspector
- basic schema inference (types + required keys)
- exports: JSON pretty, JSON minified, Markdown summary, plaintext
  paths, basic JSON Schema
- save / load local workspace via the existing serializer

### Phase 1.1+ — Follow-ups

Each lands in its own follow-up PR. Adding any of these requires also
updating `manifest.entitlements.free` and the relevant `capabilities`
flag in the same PR.

**Shipped**

- basic textual diff + `json.diff` artifact — Phase 1.1a (PR #4)
- large-document soft threshold (`json.large_document`) — Phase 1.1b (PR #5)
- in-tree tokenizer for always-accurate spans — Phase 1.1c (PR #6)
- duplicate-key detection (`json.duplicate_key`) — Phase 1.1d (PR #7)
- trailing-comma detection (`json.trailing_comma`) — Phase 1.1d (PR #7)
- `apps/web-suite` shell + UI charter ([`docs/tools/nekojson-ui.md`](tools/nekojson-ui.md)) — Phase 1.1e (this PR)

**Remaining** (each PR adds its entitlement(s) to `manifest.entitlements.free` in the same commit):

- tree view + text view — Phase 1.1f
- table view + search across keys/values — Phase 1.1g
- copy path + copy value — Phase 1.1h

### Phase 1 Pro (future private package)

Declared in the manifest as advertising. The implementations live in a
future `@nekotools-pro/*` package and are not present in this binary:

- graph mode (`json.graph.references` projector)
- semantic diff, migration studio, batch transforms (depend on Phase 3
  engines)
- advanced schema inference (oneOf, format detection, enum collapse)
- TS / Zod / data-dictionary exports
- broken-reference and duplicate-entity detection

## Phase 2 — Fast adjacent tools

Tools that reuse the spine heavily and validate it generalizes:

- NekoEnv
- NekoLogs
- NekoCron
- NekoIgnore
- NekoPackage

## Phase 3 — First premium-grade engines

This is where Pro starts to become real:

- Graph engine
- Semantic diff engine
- Migration recipe engine
- Advanced export engine

## Phase 4 — Heavier tools

- NekoYAML
- NekoAPI Lens
- NekoHeaders
- NekoTypes
- NekoRBAC

## Phase 5 — Expansion packs

- GameTools (NekoLoot, NekoBalance, NekoDialogue, …)
- NetTools (NekoCIDR, NekoDNS, NekoTLS, …)
- MathTools (NekoCurve, NekoMatrix, …)
- CSLab (NekoBigO, NekoAutomata, …)

## The rule that holds across phases

A new tool may be added only if it passes the charter (see
`tool-charter.md`). The platform exists so the 20th tool is days of
work, not months. Skipping the charter breaks that property.
