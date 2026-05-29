# Roadmap

> See [governance.md](governance.md) for how phases advance and how
> work is reviewed.

## Status board

> **Reconciliation note (2026-05-29).** This board and the Active Next Queue
> below had fallen badly out of sync with `origin/main`. The parallel
> slice-builder fleet shipped breadth far beyond the tracked queue: **35 tools
> are now on `main`, wired into `apps/web-suite` across 6 categories** (see
> [Reconciled shipped inventory](#reconciled-shipped-inventory)). The queue's
> former "Next" (NekoYAML engine) shipped long ago. Breadth (Phases 1, 2, 2B)
> is delivered and overshot; the live frontier is **depth / monetization**
> (turning advertised-future Pro into implemented, gated wedges). The forward
> queue below is **re-proposed and awaiting owner ratification** — it does not
> authorize implementation.

| Phase   | State                       | Notes |
| ------- | --------------------------- | ----- |
| Phase 0   | **Complete** (commit `93efaa5`) | Platform spine + audit patches landed. |
| Phase 1.0 | **Complete** (PR #2, commit `324115c`) | Engine MVP merged. No UI, no diff, no search — those land in Phase 1.1+ follow-up PRs. |
| Phase 1.1 | **Complete** (PR #11, commit `248761c`) | All charter-declared free engine + UI capabilities shipped: diff (1.1a), large-doc threshold (1.1b), tokenizer (1.1c), duplicate-key + trailing-comma (1.1d), UI shell (1.1e), tree + text (1.1f), table + search (1.1g), copy.path + copy.value (1.1h). |
| Phase 2   | **Complete**                | NekoEnv (PR #12/#13/#14; free tier closed at `a442233`) + NekoLogs (PR #15/#16/#54; `@nekotools/lens-kit` extracted) shipped engine + UI. |
| Phase 2B  | **Delivered + overshot**    | Tool breadth. The ratified 2B sequence (NekoYAML, NekoGitignore, NekoHeaders, NekoDiff, NekoJWT, NekoPackage) all shipped — and the fleet carried breadth to **35 tools total** (Data/Web/Text/Project/Utility/Security). All on `main` with engine + UI + conformance/edge tests. |
| Phase 3   | **Active (frontier)**       | Depth / monetization: implemented, gated Pro per tool. Offline Ed25519 license layer shipped; NekoSecrets real gated Pro shipped; the **§5.1 wedge gate** + NekoJWT verify→audit/SARIF wiring is in-flight (PR #88). Most tools' Pro is still advertised-future. |
| Phase 4   | Superseded by Phase 2B      | NekoYAML / NekoHeaders shipped (promoted in 2B). NekoAPI Lens, NekoTypes, NekoRBAC remain future candidates. |
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
| 15    | Phase 2 / NekoLogs 2.x.2 | Implementation | NekoLogs UI: table + text + summary views + structured-filter control + search + copy.line / copy.message. Wires `@nekotools/lens-logs` into `apps/web-suite` as the third tool tab and flips the UI entitlements into `manifest.entitlements.free`. **NekoLogs free tier closes here.** | Done (PR #54 / `23c9ce2`) |
| 16    | Phase 2B / NekoYAML 2B.0 | Charter | NekoYAML charter PR (10-question reuse gate). Charter doc only — no implementation. First ratified Phase 2B breadth target ([nekoyaml.md](tools/nekoyaml.md)). | Done (PR #73 / `f47241e`) |
| 17    | Phase 2B / NekoYAML 2B.1 | Engine | `@nekotools/lens-yaml` engine MVP: `yaml.text` parser (multi-document) + diagnostics + exporters (YAML↔JSON, normalized YAML, paths, markdown summary) + workspace round-trip + conformance / monetization-safety tests. | Done (engine PR #78; UI PR #79). |

> **Queue superseded — reconciled 2026-05-29.** Rows 1–17 are all `Done`. The
> slice-builder fleet shipped ~25 tools beyond row 17 without threading them
> through this table, so the row-by-row queue stopped reflecting reality. The
> factual shipped state is captured in
> [Reconciled shipped inventory](#reconciled-shipped-inventory); the forward
> work is re-proposed as the **Proposed next queue** below.

### Proposed next queue (awaiting owner ratification)

Breadth is delivered (35 tools). The remaining product risk is **depth**: most
tools advertise Pro in their manifest but ship no implemented gated wedge —
only NekoSecrets (and NekoJWT, in-flight PR #88) have real Pro. The proposed
order rolls the NekoSecrets/NekoJWT template (real gated `proExporters` +
flagship test + islands check, per [tool-standard.md](tool-standard.md) §5.1)
to the tools with the clearest paid wedge first. **This is proposed direction,
not authorization** — each row still needs charter/scope → branch → PR →
Validation → owner merge.

| Order | Scope | Wedge | Status |
| ----- | ----- | ----- | ------ |
| P1 | Land the **§5.1 wedge gate** + NekoJWT verify→audit/SARIF + NekoSecrets flagship | Encodes "done = wedge proven", brings both security tools into compliance | In review (PR #88) |
| P2 | **NekoPassword** real gated Pro | Strength/policy audit → SARIF + CI baseline (security category, natural sibling to Secrets) | Proposed |
| P3 | **NekoHeaders / NekoCSP** real gated Pro | Security-posture audit of headers/CSP → SARIF for CI | Proposed |
| P4 | **NekoPackage** real gated Pro | Dependency/license-risk report → SARIF + policy export (largest commercial wedge) | Proposed |
| P5 | Sweep remaining tools: confirm each is genuinely *advertised-future* or give it a wedge + flagship | Keeps the suite honest against §5.1 as Pro fills in | Proposed |

`Later` rows from the original plan (NekoAPI Lens, NekoTypes, NekoRBAC,
expansion packs) remain future candidates; they enter the queue via the normal
charter flow when promoted.

## Reconciled shipped inventory

Source of truth: `apps/web-suite/src/tools.ts` (the tab registry) +
`packages/lens-*`. **35 tools** are on `main`, each with an engine package
(parser + diagnostics + exporters + manifest + conformance tests) and a wired
web-suite tab. `@nekotools/lens-kit` is a shared helper, not a tool.

| Category | Count | Tools |
| --- | ---: | --- |
| Data     | 9  | NekoJSON, NekoEnv, NekoLogs, NekoYAML, NekoCSV, NekoNDJSON, NekoTOML, NekoXML, NekoINI |
| Web      | 6  | NekoJWT, NekoURL, NekoHeaders, NekoCookies, NekoMIME, NekoCSP |
| Text     | 5  | NekoCodec, NekoRegex, NekoDiff, NekoCase, NekoSort |
| Project  | 3  | NekoPackage, NekoGitignore, NekoLicense |
| Utility  | 10 | NekoBinary, NekoHash, NekoTime, NekoCron, NekoUUID, NekoSemver, NekoColor, NekoUnicode, NekoHex, NekoDuration |
| Security | 2  | NekoSecrets, NekoPassword |

**Monetization status (the depth gap):** every tool *advertises* Pro in its
manifest, but only **NekoSecrets** ships an implemented, gated Pro wedge today
(SARIF / redacted / HTML / baseline exporters). **NekoJWT**'s gated audit +
SARIF is in-flight (PR #88). All other tools' Pro entries are *advertised-future*
(declared, intentionally unimplemented — `runExporter` throws `unknown
exporter`), which the doctrine permits. Closing that gap is the Proposed next
queue above.

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

> **Reprioritization note (ratified).** A market-value reordering of the
> Phase 2 / Phase 4 tool-breadth path is **owner-ratified** in the **Phase 2B**
> section immediately below. Its first target, **NekoYAML**, is now the
> **Next** item in the Active Next Queue above (charter-only). Ratification
> sets direction and order; it does **not** authorize implementation.

## Phase 2B — Tool Breadth (RATIFIED — owner-approved direction)

> **DELIVERED (reconciled 2026-05-29).** The ratified 2B sequence below
> (NekoYAML → NekoGitignore → NekoHeaders → NekoDiff → NekoJWT → NekoPackage)
> has **all shipped**, and breadth was carried well past it to 35 tools (see
> [Reconciled shipped inventory](#reconciled-shipped-inventory)). The
> direction-setting text below is retained as the historical ratification
> record; references to NekoYAML being "Next" are superseded by the reconciled
> Active Next Queue above.

> **Status: owner-ratified roadmap direction.** This section converts the
> candidate surface in [docs/product/tool-ideals.md](product/tool-ideals.md)
> into owner-approved roadmap direction and order. Its first target —
> **NekoYAML** — is now promoted to the Active Next Queue above as the
> **Next** item (charter-only). Ratification sets direction and order; it
> does **not** authorize implementation of any tool. Each tool still
> requires charter → branch → PR → Validation → owner merge (see
> [governance.md](governance.md) and [tool-charter.md](tool-charter.md)).

**Product rationale.** The platform pattern is proven across three shipped
tools (NekoJSON, NekoEnv, NekoLogs). The next product risk is
**under-breadth**, not architecture — so the breadth path should be ordered
by **market value**, not original listing order. Phase 2B moves the suite
from 3 toward ~9 meaningful tools.

### Current canonical placement (pre-ratification homes)

| Tool | Current home |
| --- | --- |
| NekoCron | Phase 2 |
| NekoIgnore | Phase 2 |
| NekoPackage | Phase 2 |
| NekoYAML | Phase 4 |
| NekoHeaders | Phase 4 |
| NekoAPI (API Lens) | Phase 4 |

### Ratified Phase 2B breadth sequence

NekoYAML (rank 1) is now the **Next** Active Next Queue item (charter-only);
ranks 2–6 are ratified order and enter the queue as each predecessor's
charter completes.

| Rank | Tool | Move | Why |
| ---: | --- | --- | --- |
| 1 | **NekoYAML** | promote from Phase 4 | Most natural sibling to JSON/env; high config pain; sensitive-artifact fit. |
| 2 | **NekoIgnore** | keep (Phase 2) | Fast, practical quick-win; already a documented candidate. |
| 3 | **NekoHeaders** | promote from Phase 4 | Easy to demo; web/security posture; sensitive-artifact fit. |
| 4 | **NekoDiff** | new candidate | Cross-tool comparison glue; multiplies the value of the shipped tools. |
| 5 | **NekoJWT** | new candidate | Strong sensitive-artifact use case; decode / inspect only, careful safety framing. |
| 6 | **NekoPackage** | keep (Phase 2) | Largest, most commercially serious wedge. |

This **promotes** NekoYAML and NekoHeaders from Phase 4 (stated explicitly —
not a silent demotion of any item) and introduces **NekoDiff** and
**NekoJWT** as new candidates currently held only in the ideation pool.

### Parked / later candidates (with rationale)

- **NekoCron — not deleted; parked to a later slot.** A useful scheduling
  utility, but less central to the sensitive-artifact / local-first
  workbench positioning than the breadth wedges above. It can return to the
  active sequence after stronger wedges land.
- **NekoAPI (API Lens) — remains Phase 4** for now (heavier; a
  request/response artifact inspector, not a Postman clone). Candidate for a
  later breadth wave.
- The remaining ideation-pool tools (Regex, Secrets, Schema, Markdown, and
  the commodity set: Base64, Hash, Timestamp, Color, UUID, URL) stay in
  [tool-ideals.md](product/tool-ideals.md) as future / parked candidates.

### What this ratification does NOT do

- It does **not** authorize implementation of any tool — NekoYAML enters the
  queue as a **charter-only** step (charter PR → Validation → owner merge →
  separate engine PR → separate UI PR).
- It does **not** delete or silently demote any existing roadmap entry.
- It promotes **only NekoYAML** into the Active Next Queue now; ranks 2–6 are
  ratified *direction* and enter the queue subsequently, each via the normal
  closeout flow.

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

> **Note (ratified promotion).** The **Phase 2B** section above is
> owner-ratified: **NekoYAML** is promoted to the Active Next Queue (next,
> charter-only) and **NekoHeaders** is ratified breadth direction, with
> **NekoAPI / API Lens** held as a later breadth-wave candidate. The entries
> in this Phase 4 list are retained for reference; nothing here is deleted.

## Phase 5 — Expansion packs

- GameTools (NekoLoot, NekoBalance, NekoDialogue, …)
- NetTools (NekoCIDR, NekoDNS, NekoTLS, …)
- MathTools (NekoCurve, NekoMatrix, …)
- CSLab (NekoBigO, NekoAutomata, …)

## The rule that holds across phases

A new tool may be added only if it passes the charter (see
`tool-charter.md`). The platform exists so the 20th tool is days of
work, not months. Skipping the charter breaks that property.
