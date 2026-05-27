# NekoYAML — Phase 2B charter (NekoYAML 2B.0)

> Status: **ENGINE MVP — Phase 2B engine PR (Wave 2 PR 1).** This document is
> the NekoYAML tool charter ([tool-charter.md](../tool-charter.md)). The engine
> (`@nekotools/lens-yaml`) — `yaml.text` + `yaml.from-json` parsers, diagnostics,
> exporters, manifest, and conformance tests — is delivered by the Phase 2B
> engine PR. The **NekoYAML UI tab is the next PR** (Wave 2 PR 2); the roadmap
> closeout follows. Pro features remain advertising-only (not bundled). Per the
> open-core governance rule each free entitlement becomes real only in the PR
> that ships it — the engine free-tier set is now implementation-backed in
> `@nekotools/lens-yaml`.

**Tool identity.** NekoYAML — a local YAML workbench.

- **Package target:** `@nekotools/lens-yaml` — *future only*, not created here.
- **UI target:** a NekoYAML tab in `apps/web-suite` — *future only*, not created here.

NekoYAML is the **first Phase 2B breadth tool** and the **fourth substrate**
the platform is tested against, after JSON (a value tree), dotenv (a flat
`key=value` map), and logs (a heterogeneous record stream). YAML is a
*human-authored, indentation-sensitive superset-of-JSON tree* with comments,
anchors/aliases, and multi-document streams — close enough to NekoJSON to
exercise heavy reuse, different enough (whitespace significance, comments,
anchors, tabs-forbidden, `---` document splits) to be a real reuse-gate test.

## Problem statement

YAML is everywhere developers keep configuration — CI pipelines, Kubernetes
manifests, Compose files, app config — and it is **fragile**:
indentation-sensitive, tab-hostile, easy to misnest, and full of subtle
type-coercion footguns (the "Norway problem": `no` → `false`). It is also
**often sensitive** (it frequently holds secrets, hostnames, and internal
topology). Today a developer who wants to quickly validate or convert a YAML
snippet typically pastes it into a random online validator/converter — exactly
the behavior NekoTools exists to make unnecessary.

## Product thesis

NekoYAML extends the **sensitive-artifact workbench** thesis alongside
NekoJSON, NekoEnv, and NekoLogs: parse / validate / view / convert / export a
config artifact **entirely locally**, with zero telemetry and no network. It
is the strongest Phase 2B opener because it is the most natural sibling to the
already-shipped NekoJSON (both are trees over the same contracts) while adding
genuine YAML-specific surface.

## What NekoYAML is

A local, offline YAML workbench. The user pastes, drops, or opens YAML text.
NekoYAML parses it into a structured tree (supporting multi-document streams),
reports line/column diagnostics, lets the user view it as a tree or as
gutter-annotated source, converts YAML → JSON (and JSON → YAML when the input
is representable), and exports normalized output. No network. No account. No
sync.

## What NekoYAML is *not*

- **Not a Kubernetes / GitHub Actions / OpenAPI validator** (initially). It
  validates YAML *syntax and structure*, not domain schemas. Schema-aware
  validation is a Pro candidate, not free-tier engine scope.
- **Not a schema-inference engine** (initially). NekoJSON-style inference over
  YAML is deferred.
- **Not a templating engine.** It does not evaluate Helm, Jinja, Go templates,
  or `!!`-custom tags as code.
- **Not a fetcher.** A URL or `$ref` inside YAML is rendered as text, never
  resolved or fetched.
- **Not a durable store or a watcher.** It analyzes the snapshot you handed it
  for the session.

## The 10 charter questions

### 1. Artifact kind

NekoYAML introduces, all namespaced under `yaml.*` (none reused from `json.*`):

| Kind | Value | Status |
| --- | --- | --- |
| `yaml.document` | A parsed YAML stream: an ordered list of one or more documents (`---`-separated), each a structured node tree, plus detected metadata (document count, presence of comments/anchors/aliases, indentation unit). | Phase 2B engine, free. |
| `yaml.json-projection` | The JSON value-projection of a `yaml.document` (the "safe YAML → JSON" result), plus notes on any constructs that did not round-trip cleanly (anchors expanded, comments dropped, non-JSON scalar tags coerced). Parallel to NekoJSON's derived artifacts — produced by the parser run, not a separate stage. | Phase 2B engine, free. |

JSON → YAML is handled as an **exporter target** over a JSON artifact (see
Q4), not a new artifact kind. No new contract types are introduced (see Q7).

### 2. Parser contract

Reuses `@nekotools/contracts`'s `Parser<TArtifact>`. New parser:

- `yaml.text` — accepts raw YAML text and produces `yaml.document` (and the
  derived `yaml.json-projection` in the same run, a pure function of the
  document so it cannot drift). Supports **multi-document** streams
  (`---` / `...`). The parser is **whole-snapshot** (like NekoJSON's
  tokenizer), never streaming, and **never throws** — malformed YAML yields
  structured diagnostics (Q3), not exceptions.

No `yaml.url` parser. NekoYAML never fetches. The concrete YAML-parsing
mechanism (in-tree vs. a vetted **offline, pure-JS, zero-network** dependency)
is an **engine-PR** decision, explicitly *not* made or installed in this
charter PR — see *Risks* (dependency choice) and Q8.

### 3. Diagnostic contract

Reuses the existing `Diagnostic` shape. Anticipated engine-MVP codes (the
exact set is pinned by the engine PR that ships them):

| Code | Severity | Meaning |
| --- | --- | --- |
| `yaml.empty_input` | info | Input is whitespace/comment only. Produces an empty `yaml.document` (mirrors `env.empty_input` policy). |
| `yaml.syntax_error` | error | Malformed YAML (bad indentation, unclosed flow collection, invalid token) with line/column. |
| `yaml.tab_indentation` | error | A tab was used for indentation (YAML forbids it) — a common, confusing failure worth a dedicated code. |
| `yaml.duplicate_key` | warning | A mapping has a duplicate key (YAML spec disallows; many parsers silently last-wins). |
| `yaml.multiple_documents` | info | The stream contains more than one document. |
| `yaml.unresolved_alias` | error | An alias (`*x`) references an anchor (`&x`) that was not defined. |
| `yaml.large_document` | info | Input exceeds the soft size threshold (same `TextEncoder` byte-count knob as NekoJSON / NekoEnv / NekoLogs). |

All malformed inputs produce structured diagnostics; the parser does not throw.

### 4. Export contract

Reuses the `Exporter<TArtifact>` interface. Anticipated free targets:

| Exporter id | Target | Audience | Free / Pro |
| --- | --- | --- | --- |
| `yaml.export.json` | json | YAML → JSON projection (pretty). | Free |
| `yaml.export.json.min` | json | YAML → minified JSON. | Free |
| `yaml.export.yaml.normalized` | text | Re-emit normalized/canonical YAML (consistent indentation, sorted-or-stable keys). | Free |
| `yaml.export.paths` | text | Flattened path list (`a.b.c: value`), like NekoJSON's plaintext paths. | Free |
| `yaml.export.markdown.summary` | markdown | Document summary (doc count, key count, anchors/aliases present, diagnostics). | Free |
| `json.import.yaml` (direction: JSON → YAML) | text | Emit YAML from a JSON artifact when representable; flags non-representable constructs. | Free |
| `yaml.export.schema.report` | markdown | Schema-validation report (k8s/Actions/OpenAPI aware). | Pro |
| `yaml.export.roundtrip.diff` | markdown/html | YAML↔JSON round-trip fidelity diff. | Pro |

All exports run locally. None ship data anywhere.

### 5. Graph / table / matrix primitive

- **Tree** is the primary view: the YAML node tree, reusing the shell's
  existing tree primitive (the same one NekoJSON uses) — no new contract.
- **Text** view: raw source with a line-number gutter + per-line diagnostic
  markers, reusing NekoJSON's generic `groupSeverityByLine` gutter pattern.
- **No matrix** projection (YAML is a tree, not a record stream).
- **Graph** (Pro): an anchor/alias reference projection (`yaml.graph.anchors`)
  linking aliases to their anchors; depends on the Phase 3 graph engine.
  Declared as advertising, not registered in the free build
  (`capabilities.canProjectGraph = false`).

### 6. Workspace

**Reuses the existing Phase 0 `Workspace` shape and the
`jsonWorkspaceSerializer` from `@nekotools/tool-runtime`. NekoYAML introduces
no new workspace contract.** A NekoYAML workspace is a `Workspace` whose
artifacts have kind `yaml.*`. The engine PR's conformance test will prove
lossless round-trip for `yaml.document` (including a multi-document case),
mirroring NekoEnv / NekoLogs.

Anticipated `uiState` fields for the future UI PR: `viewMode` (`tree | text`),
`searchQuery`, `activeLine`.

### 7. Reuse (reuse-gate assessment)

NekoYAML reuses, in priority order:

| Existing package | Reused for |
| --- | --- |
| `@nekotools/contracts` | Every contract. NekoYAML introduces **no new contract types** — only new `yaml.*` artifact-kind strings, a parser id, diagnostic codes, and exporter ids. |
| `@nekotools/schemas` | Workspace + artifact + manifest schema validation; the artifact-kind validator already accepts any `yaml.*` string. |
| `@nekotools/tool-runtime` | Registry, parser runner, export runner, workspace serializer, entitlement gate — NekoYAML registers exactly like NekoJSON/NekoEnv/NekoLogs. |
| `apps/web-suite` | The tool-tabs shell. NekoYAML becomes the **fourth tab** using the same `App` switcher, paste card, results card, **tree view**, text gutter, search, and copy affordances. |

**Comparison with NekoJSON (the closest sibling).**

- *Shared:* the tree-viewer primitive, the text gutter (`groupSeverityByLine`),
  the export runner, the diagnostics conventions (`*.empty_input`,
  `*.large_document`, line/column spans), the workspace serializer, and the
  paste/results UI shell.
- *Must remain YAML-specific:* indentation-sensitive parsing, tab-indentation
  detection, comment/anchor/alias handling, multi-document streams, and the
  YAML→JSON projection (with lossy-construct reporting). NekoYAML ships its own
  parser; it does **not** reuse NekoJSON's JSON tokenizer literally, because
  YAML's grammar is a different (and larger) language.

No new helper-extraction trigger is anticipated here (the `lens-kit`
clock/id-factory extraction already fired at NekoLogs). If a YAML/JSON shared
tree-normalization helper proves to be the *third* duplication later, *that* is
when it gets extracted — same "wait for the third occurrence" discipline.

### 8. Offline policy

`networkPolicy: 'network-forbidden'`. NekoYAML never opens a socket, never
fetches a `$ref`/URL/`!include`, and never resolves anything remotely. A value
that looks like a URL is rendered as text. `dataCollection: 'none'`,
`requiresAccount: false`, `requiresInternetForCoreFeatures: false`,
`offlineSupported: true`. Any YAML-parsing dependency chosen by the engine PR
must be pure-JS and pass `@nekotools/offline-guard` with zero violations.

### 9. Entitlements

The exact free / Pro split lands in `manifest.entitlements.free` / `.pro` in
the engine + UI PRs. Every free entry is implementation-backed in the same PR
that adds it.

**Free (engine MVP):**

- `parse` — `yaml.text` parser (multi-document aware).
- `validate` — the diagnostics from Q3 (syntax, tabs, duplicate key,
  unresolved alias, …).
- `convert.yaml-to-json` — the `yaml.json-projection` + `yaml.export.json` /
  `yaml.export.json.min`.
- `convert.json-to-yaml` — `json.import.yaml`, when the JSON is representable
  (flags non-representable constructs rather than guessing).
- `normalize` — `yaml.export.yaml.normalized`.
- Exports: `yaml.export.json`, `yaml.export.json.min`,
  `yaml.export.yaml.normalized`, `yaml.export.paths`,
  `yaml.export.markdown.summary`.
- `workspace.save` — round-trip via the shared serializer.

**Free (UI):**

- `view.tree`, `view.text` — two NekoYAML view modes in `apps/web-suite`.
- `search` — free-text search across keys/values.
- `copy.path`, `copy.value` — local clipboard via the shared `clipboard.ts`.

**Pro (advertising — implementation in a future `@nekotools-pro/*` package):**

- `schema.validate` — Kubernetes / GitHub Actions / OpenAPI-aware validation.
- `diff.roundtrip` — YAML↔JSON round-trip fidelity diff.
- `policy.packs` — config policy packs (org rules).
- `redaction.presets` — secret-aware redaction for sharing config.
- `batch.validate` — validate many YAML files at once.
- `recipe.saved` — saved conversion/validation recipes.
- `workspace.snapshots` — named workspace snapshots.
- `graph.anchors` — anchor/alias reference projection.

Free is genuinely useful on its own: parse and validate fragile YAML, see it as
a tree, convert to/from JSON, normalize, and export — entirely offline.

### 10. Out of scope

- Kubernetes / GitHub Actions / OpenAPI **schema** validation (Pro).
- Schema **inference** over YAML.
- Pro policy packs / redaction presets / batch / saved recipes / snapshots.
- **Any engine or UI implementation in this charter PR.**
- Templating evaluation (Helm/Jinja/Go templates), custom-tag code execution.
- Fetching anything referenced inside the YAML.
- Live file watching / durable storage.

## Risks

- **YAML ambiguity & type coercion.** The "Norway problem" and implicit
  typing (`yes`/`on`/`1.0`/dates) make YAML→JSON lossy or surprising.
  *Mitigation:* the projection reports coercions; normalization is explicit;
  free-tier stays descriptive, not opinionated.
- **Comments, anchors & aliases.** Comments are not part of the data model and
  are dropped on JSON projection; anchors/aliases expand. *Mitigation:* the
  parser records their presence and the projection flags what was lost.
- **Round-trip preservation.** Byte-exact YAML round-trips are hard.
  *Mitigation:* free-tier offers *normalized* output (not byte-preserving);
  fidelity diffing is a Pro feature, scoped explicitly.
- **Multi-document streams.** `---`/`...` splitting and per-document diagnostics
  must be handled, not flattened silently. *Mitigation:* `yaml.document` is an
  ordered list; `yaml.multiple_documents` is surfaced.
- **Unsafe schema assumptions.** Pretending to validate k8s/Actions for free
  would overpromise. *Mitigation:* schema-aware validation is explicitly Pro
  and out of free scope.
- **Dependency-choice risk.** A YAML parser is non-trivial; an in-tree parser
  is a large effort, while a third-party parser adds a dependency.
  *Mitigation:* the **engine PR** (not this charter) chooses a pure-JS,
  zero-network parser that passes offline-guard, and documents the choice;
  this charter adds **no** dependency.

## Required implementation sequence

NekoYAML follows the established per-tool sequence; each step is its own
authorized PR:

1. **Charter PR** (this PR) — docs-only; defines scope and the reuse gate.
2. **Engine PR** — `@nekotools/lens-yaml`: parser + diagnostics + exporters +
   workspace round-trip + conformance & monetization-safety tests. No UI.
3. **UI PR** — NekoYAML tab in `apps/web-suite` (tree/text views, search, copy)
   + flips the UI entitlements into `manifest.entitlements.free`.
4. **Roadmap closeout PR** — marks the NekoYAML rows `Done` and flips the next
   Phase 2B item (NekoIgnore) to `Next`.

## Acceptance / future validation requirements

When the engine and UI PRs are later authorized, they must meet (each in its
own PR, mirroring NekoEnv/NekoLogs):

- [ ] Unit tests for the parser, diagnostics, and every free exporter.
- [ ] Malformed-YAML tests (bad indentation, tabs, unclosed flow collections,
      duplicate keys).
- [ ] Multi-document (`---`/`...`) stream tests.
- [ ] Anchor / alias tests, including unresolved-alias diagnostics.
- [ ] YAML → JSON and JSON → YAML conversion tests, including
      non-representable / lossy-construct reporting.
- [ ] Conformance test: parser → diagnostic → export → workspace round-trip
      (including a multi-document workspace).
- [ ] Monetization-safety tests: free entitlements match the exact
      implementation-backed set; Pro ids declared-but-not-registered;
      `runExporter` rejects every Pro id.
- [ ] `pnpm offline-guard` sees no new violations (including any chosen YAML
      dependency).
- [ ] Accessibility checks for the UI phase (keyboard nav, contrast, labels).
- [ ] This charter doc updated from **PROPOSED** to **IMPLEMENTED**.

## `ToolManifest`

The canonical NekoYAML manifest will live at
`packages/lens-yaml/src/manifest.ts` once the engine PR lands — it will be the
source of truth, and this doc will not duplicate it (duplicated manifests
drift), matching the NekoJSON / NekoEnv / NekoLogs charters. No manifest ships
in this charter PR.

## Why this is the right first Phase 2B tool

1. **Highest-fit sibling.** YAML is the most natural neighbor to the
   already-shipped NekoJSON (both trees over the same contracts), so reuse is
   high and risk is well-understood.
2. **Real config pain.** YAML's indentation/tab/typing footguns are a daily
   developer frustration; a local validator/converter is immediately useful.
3. **Sensitive-artifact alignment.** Config YAML frequently holds secrets and
   internal topology — exactly the "don't paste this into a random website"
   case the offline doctrine is built for.
4. **Exercises new substrate surface over existing contracts.** Comments,
   anchors/aliases, multi-document streams, and YAML→JSON projection stress the
   spine without inventing new contract types.
5. **It is genuinely useful offline.** Paste fragile YAML, see why it's broken,
   convert it to JSON, normalize it, export — no service, no upload.
