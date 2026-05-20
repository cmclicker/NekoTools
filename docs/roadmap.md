# Roadmap

> See [governance.md](governance.md) for how phases advance and how
> work is reviewed.

## Status board

| Phase   | State                       | Notes |
| ------- | --------------------------- | ----- |
| Phase 0 | **Complete** (commit `93efaa5`) | Platform spine + audit patches landed. |
| Phase 1 | **Free-tier MVP in review** | Charter merged (PR #1). Implementation PR pending CI + auditor review. Follow-up PRs land the deferred items in `docs/tools/nekojson.md`. |
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

**Charter:** [docs/tools/nekojson.md](tools/nekojson.md). Implementation
is blocked until the charter PR is merged.

Scope (free, Phase 1):

- parse, validate, format
- tree / table / text views
- path inspector, search
- basic diff
- basic schema inference
- export (JSON pretty / minified, Markdown summary, plaintext paths,
  basic JSON Schema)

Pro features declared in the manifest are deferred to Phase 3 (graph,
semantic diff, migration) and Phase 1 follow-ups (advanced schema,
TS/Zod, data dictionary).

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
