# Roadmap

> See [governance.md](governance.md) for how phases advance and how
> work is reviewed.

## Status board

| Phase   | State                       | Notes |
| ------- | --------------------------- | ----- |
| Phase 0   | **Complete** (commit `93efaa5`) | Platform spine + audit patches landed. |
| Phase 1.0 | **Complete** (PR #2, commit `324115c`) | Engine MVP merged. No UI, no diff, no search — those land in Phase 1.1+ follow-up PRs. |
| Phase 1.1 | **Complete** (PR #11, commit `248761c`) | All charter-declared free engine + UI capabilities shipped: diff (1.1a), large-doc threshold (1.1b), tokenizer (1.1c), duplicate-key + trailing-comma (1.1d), UI shell (1.1e), tree + text (1.1f), table + search (1.1g), copy.path + copy.value (1.1h). |
| Phase 2   | **Active**                  | NekoEnv shipped (PR #12/#13/#14; free tier closed at `a442233`). NekoLogs charter merged (PR #15 / `03b5853`); NekoLogs engine MVP + `@nekotools/lens-kit` extraction shipped (PR #16 / `bdc3f1e`); NekoLogs UI is the queued next-up implementation. |
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
| 6     | Phase 1.1e | UI Planning + Shell | `apps/web-suite` shell scaffold + UI charter; manifest-summary panel. Views/search/copy queued as 1.1f–h. | Done (PR #8 / `50ab36c`) |
| 7     | Phase 1.1f | Implementation | NekoJSON **tree view** + **text view** + flip `view.tree` / `view.text` into `entitlements.free`. | Done (PR #9 / `87293eb`) |
| 8     | Phase 1.1g | Implementation | NekoJSON **table view** + **search** across keys/values + flip `view.table` / `search` into `entitlements.free`. | Done (PR #10 / `337a05d`) |
| 9     | Phase 1.1h | Implementation | **Copy.path** + **copy.value** affordances + flip both into `entitlements.free`. **Phase 1 free tier closes here.** | Done (PR #11 / `248761c`) |
| 10    | Phase 2.0  | Charter        | NekoEnv charter PR (10-question reuse gate). Charter doc only — no implementation. | Done (PR #12 / `0b832dc`) |
| 11    | Phase 2.1  | Implementation | `@nekotools/lens-env` engine MVP: parser, diagnostics, exporters, schema inference, textual diff, workspace round-trip + conformance tests. No UI. | Done (PR #13 / `4d188f9`) |
| 12    | Phase 2.2  | Implementation | NekoEnv UI: table + text + diff views + search + copy.key / copy.value + mask.value. Wires `@nekotools/lens-env` into `apps/web-suite` and flips `view.table`, `view.text`, `view.diff`, `search`, `copy.key`, `copy.value`, `mask.value` into `manifest.entitlements.free`. **NekoEnv free tier closes here.** | Done (PR #14 / `a442233`) |
| 13    | Phase 2 / NekoLogs 2.0 | Charter | NekoLogs charter PR (10-question reuse gate). Charter doc only — no implementation. | Done (PR #15 / `03b5853`) |
| 14    | Phase 2 / NekoLogs 2.x.1 | Implementation | `@nekotools/lens-logs` engine MVP: `log.text` (JSON-per-line / logfmt / plaintext detection) + `log.filter` parsers, diagnostics, summary + basic histogram, text/messages/json/csv/markdown exporters, workspace round-trip + conformance tests. **Extracts `@nekotools/lens-kit`** (clock + id-factory) and re-points lens-binary/json/env/logs at it — the 3rd-reuse trigger from NekoJSON charter §7. No UI. | Done (PR #16 / `bdc3f1e`) |
| 15    | Phase 2 / NekoLogs 2.x.2 | Implementation | NekoLogs UI: table + text + summary views + structured-filter control + search + copy.line / copy.message. Wires `@nekotools/lens-logs` into `apps/web-suite` as the third tool tab and flips the UI entitlements into `manifest.entitlements.free`. **NekoLogs free tier closes here.** | **Next** |

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
- `apps/web-suite` shell + UI charter ([`docs/tools/nekojson-ui.md`](tools/nekojson-ui.md)) — Phase 1.1e (PR #8)
- tree view + text view (`view.tree`, `view.text`) — Phase 1.1f (PR #9)
- table view + search (`view.table`, `search`) — Phase 1.1g (PR #10)
- copy.path + copy.value (`copy.path`, `copy.value`) — Phase 1.1h (PR #11)

**Phase 1 free tier is closed.** Every charter-declared free feature
ships and is declared in `manifest.entitlements.free`. The Phase 1 Pro
manifest declarations remain advertising for the future
`@nekotools-pro/*` package.

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

- NekoEnv (**shipped** — [docs/tools/nekoenv.md](tools/nekoenv.md); free tier closed at PR #14 / `a442233`)
- NekoLogs (active — charter in [docs/tools/nekologs.md](tools/nekologs.md))
- NekoCron
- NekoIgnore
- NekoPackage

NekoEnv was the first Phase 2 reuse-gate tool: structurally different
from NekoJSON (line-oriented dotenv, not a tree), zero new contract
types, exercised the entire spine. It shipped engine + UI and proved
the spine generalizes.

NekoLogs is the next reuse-gate tool and a harder test: a
heterogeneous record stream (JSON-per-line / logfmt / plaintext) with
timestamps and severity levels — a third distinct substrate. It also
exercises the matrix projection (`log.histogram`) and the `csv`
export target for the first time, and fires the
"duplicated-more-than-twice" extraction rule by lifting the
clock/id-factory helper into a shared `@nekotools/lens-kit` package
in its engine PR.

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
