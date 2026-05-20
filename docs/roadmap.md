# Roadmap

## Current: Phase 0 — Platform spine

Build the minimum real NekoTools spine that proves the architecture is
not theoretical.

Phase 0 is complete when:

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

## Next: Phase 1 — NekoJSON proof tool

Not flagship. Proof-grade. One tool, done well, that validates the
spine generalizes from a trivial conformance lens to a real product
tool.

- parse, validate, format
- tree / table / text views
- path inspector, search
- basic diff
- schema inference
- export

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
