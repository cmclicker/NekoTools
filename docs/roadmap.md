# Roadmap

> See [governance.md](governance.md) for how phases advance and how
> work is reviewed.

## Status board

| Phase   | State                       | Notes |
| ------- | --------------------------- | ----- |
| Phase 0 | **Complete** (commit `93efaa5`) | Platform spine + audit patches landed. |
| Phase 1.0 | **Engine MVP in review** | Charter merged (PR #1). Engine implementation PR #2 in review. No UI, no diff, no search — those land in Phase 1.1+ follow-up PRs. |
| Phase 2 | Not started                 | Fast adjacent tools. |
| Phase 3 | Not started                 | Premium engines (graph, semantic diff, migration). |
| Phase 4 | Not started                 | Heavier tools (YAML, API Lens, Headers, Types, RBAC). |
| Phase 5 | Not started                 | Expansion packs. |

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

### Phase 1.0 — Engine MVP (this PR's scope)

Engine-only, no UI. The features below are implementation-backed in
`@nekotools/lens-json` and declared in `manifest.entitlements.free`:

- parse / validate / format / minify
- JSON Pointer (`json.pointer`) inspector
- basic schema inference (types + required keys)
- exports: JSON pretty, JSON minified, Markdown summary, plaintext
  paths, basic JSON Schema
- save / load local workspace via the existing serializer

### Phase 1.1+ — Follow-ups (free, not in this PR)

Each lands in its own follow-up PR. Adding any of these requires also
updating `manifest.entitlements.free` and the relevant `capabilities`
flag in the same PR:

- tree / table / text views (UI; needs `apps/web-suite` to grow past
  placeholder)
- search across keys and values (UI)
- copy path / copy value (UI)
- basic textual diff + `json.diff` artifact
- duplicate-key detection (`json.duplicate_key`)
- trailing-comma support / non-strict mode (`json.trailing_comma`)
- large-document soft threshold (`json.large_document`)
- in-tree tokenizer for always-accurate spans

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
