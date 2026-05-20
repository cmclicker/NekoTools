# NekoJSON — Phase 1 charter

> Status: **IMPLEMENTED (free tier MVP).** The charter was approved in
> [PR #1](https://github.com/cmclicker/NekoTools/pull/1). The MVP
> implementation landed in the Phase 1 implementation PR. Features
> deferred from this PR are listed under "Deferred from this PR" below.

NekoJSON is the Phase 1 proof tool. The point of Phase 1 is to validate
that the platform spine generalizes from the trivial NekoBinary
conformance lens to a real product tool. NekoJSON is not the flagship —
it is proof.

## What NekoJSON is

A local, offline JSON workbench. The user pastes, drops, or opens a JSON
document. NekoJSON parses it, validates it, lets the user navigate it,
and exports a result. No network. No account. No sync.

## What NekoJSON is *not*

- A JSON-over-HTTP client. NekoJSON does not fetch URLs found inside
  documents, including `$ref` schema references.
- A JSON-Logic / JSONata / JMESPath evaluator. Querying is path-based
  and structural, not a programmable language runtime.
- A schema registry. NekoJSON works on local documents. A user who
  wants schema reuse exports a JSON Schema artifact and saves it
  themselves.

## The 10 charter questions

### 1. Artifact kind

NekoJSON introduces:

| Kind                 | Value                                                       | Status        |
| -------------------- | ----------------------------------------------------------- | ------------- |
| `json.document`      | The parsed root value of a JSON document.                   | Shipped, free. |
| `json.path-result`   | The value(s) at a JSON Pointer / structural path.           | Shipped, free. |
| `json.schema`        | An inferred or imported JSON Schema document.               | Basic inference shipped (free). Advanced inference is Pro, deferred. |
| `json.diff`          | A line-level textual diff between two `json.document` artifacts (Phase 1.1a) or a structural / semantic diff (Pro). | Textual diff shipped, free (Phase 1.1a). Semantic diff is Pro and depends on the Phase 3 diff engine. |

Every kind is namespaced under `json.*`. None of them have any meaning
outside NekoJSON.

### 2. Parser contract

Reuses `@nekotools/contracts`'s `Parser<TArtifact>`. New parsers:

- `json.text` — accepts raw JSON text, produces `json.document`. **MVP
  is strict mode only.** Backed by `JSON.parse`; on failure, the
  diagnostic carries a best-effort `startOffset` extracted from the V8
  error message when it reports `position N` (older Node / non-V8
  runtimes may report no position, in which case the span is omitted —
  the diagnostic still ships).
- `json.pointer` — accepts a JSON Pointer (`/foo/bar/0`) against a
  loaded `json.document`, produces `json.path-result`. This is a
  parser, not a runtime, because it converts user input (the pointer)
  into a structured artifact.

Non-strict parsing (trailing commas, comments, partial-artifact
recovery) and an in-tree tokenizer with always-accurate spans are
deferred to follow-up PRs — see the "Deferred from this PR" table.

No `json.url` parser. NekoJSON never fetches.

### 3. Diagnostic contract

Reuses the existing `Diagnostic` shape. Codes shipping in the MVP and
codes reserved for follow-up PRs:

| Code                          | Status   | Severity | Meaning |
| ----------------------------- | -------- | -------- | ------- |
| `json.syntax_error`           | shipped  | error    | The text is not valid JSON. |
| `json.empty_input`            | shipped  | error    | Input was whitespace only. |
| `json.pointer.invalid`        | shipped  | error    | Pointer text is syntactically invalid (RFC 6901). |
| `json.pointer.unresolved`     | shipped  | error    | A JSON Pointer did not resolve. |
| `json.trailing_comma`         | reserved | warning  | Comma before `]` or `}` (non-strict mode). |
| `json.duplicate_key`          | reserved | warning  | Object has the same key twice. |
| `json.large_document`         | reserved | info     | Document exceeds a soft size threshold; some Pro views are gated. |

"Reserved" codes appear in [`packages/lens-json/src/diagnostics.ts`](../../packages/lens-json/src/diagnostics.ts)
as a comment so a follow-up PR cannot accidentally re-use the names
with a different meaning. They are not emitted by the MVP.

The MVP populates spans on a best-effort basis from `JSON.parse` error
messages. An in-tree tokenizer that always produces accurate spans is
deferred to a follow-up PR. No throwing; every malformed input produces
diagnostics.

### 4. Export contract

Reuses the `Exporter<TArtifact>` interface. Targets:

| Exporter id                       | Target      | Audience | Free / Pro |
| --------------------------------- | ----------- | -------- | ---------- |
| `json.export.json.pretty`         | json        | Default. | Free |
| `json.export.json.minified`       | json        | Copy-paste into prod configs. | Free |
| `json.export.markdown.summary`    | markdown    | A summary table of top-level keys + diagnostics. | Free |
| `json.export.plaintext.paths`     | plaintext   | TSV of every JSON Pointer path + value type. | Free |
| `json.export.schema.json-schema`  | json        | Inferred JSON Schema. Basic inference free; advanced inference (`oneOf`, enum collapse, format detection) is Pro. | Mixed |
| `json.export.diff.textual`        | plaintext   | Unified-diff plaintext of a `json.diff` artifact. (Phase 1.1a.) | Free |
| `json.export.types.typescript`    | plaintext   | Generated TypeScript interfaces. | Pro |
| `json.export.types.zod`           | plaintext   | Generated Zod schema. | Pro |
| `json.export.docs.data-dictionary`| markdown    | Multi-document data dictionary with examples. | Pro |

All exports run locally. None of them ship the data anywhere.

### 5. Graph / table / matrix primitive

**MVP ships neither.** This section is intent for Phase 1.1+ and later.

- Phase 1.1+ free: a **table** projection over object arrays — flatten
  `arr[*]` into a row-per-element view. UI work; will be implemented
  in the same follow-up PR that wires `apps/web-suite` to consume
  artifacts. No new contract required.
- Phase 1.1+ free: **tree / text** views are similarly UI-only and
  ship in the same family of follow-up PRs.
- Pro: a **graph** projection (`GraphProjector`) that maps object
  references (by id, by `$ref`, by user-configured key) into nodes
  and edges. Pro because it depends on the Phase 3 graph engine. The
  manifest declares the projector id (`json.graph.references`) as
  honest advertising; the implementation is not in the free build —
  see the monetization-safety tests in
  [`packages/lens-json/src/__tests__/conformance.test.ts`](../../packages/lens-json/src/__tests__/conformance.test.ts).

Current-build truth in the manifest: `capabilities.canProjectGraph =
false`. It flips to `true` when the Pro build's registration includes
the projector.

### 6. Workspace

Reuses the existing Phase 0 `Workspace` shape and the
`jsonWorkspaceSerializer` exported from `@nekotools/tool-runtime`. The
MVP introduces no new workspace contract — it only proves that the
generic Phase 0 serializer round-trips losslessly for `json.document`
artifacts. This is asserted by the workspace round-trip test in
[`conformance.test.ts`](../../packages/lens-json/src/__tests__/conformance.test.ts).

**Shipped in MVP**

| Field                   | What ships now |
| ----------------------- | -------------- |
| `artifacts`             | The loaded `json.document` artifact(s) — including the test case with two documents for a future diff session. |
| `diagnostics`           | Diagnostics produced during the session. |
| `uiState` (passthrough) | The workspace serializer accepts any `uiState` object and round-trips it. The MVP test passes `{ activePath, viewMode }` to prove passthrough; the MVP does not yet *consume* those fields anywhere because no UI exists. |

**Intent for Phase 1.1+** (UI follow-up PRs will *consume* these fields;
adding consumption goes in the same PR as the UI that needs it):

- `uiState.activePath` — last selected JSON Pointer.
- `uiState.viewMode` — `tree | table | text`.
- `uiState.searchQuery` — the most recent search.
- `notes` — free-text user notes.

A NekoJSON workspace is portable: it round-trips losslessly today and
will continue to do so as fields are added, per the workspace contract
versioning rule in [`contract-versioning.md`](../contract-versioning.md).

### 7. Reuse

NekoJSON reuses, in priority order:

| Existing package           | Reused for                                  |
| -------------------------- | ------------------------------------------- |
| `@nekotools/contracts`     | Every contract. NekoJSON introduces no new contracts. |
| `@nekotools/schemas`       | Workspace + artifact + manifest validation. |
| `@nekotools/tool-runtime`  | Registry, runners, serializer, entitlement gate. |
| `@nekotools/lens-binary`   | The clock + id-factory pattern from `util.ts` becomes a shared helper or is duplicated literally if it does not generalize. If duplicated more than twice across tools, it is extracted in a follow-up PR. |

NekoJSON does **not**:

- Invent a new artifact root.
- Bypass the workspace serializer.
- Implement its own offline-policy.
- Re-create a parser registry.

### 8. Offline policy

`networkPolicy: 'network-forbidden'`.

NekoJSON does not fetch `$ref` URLs. A future "explain how to import
this `$ref` locally" diagnostic and the UI affordance that surfaces it
both live in Phase 1.1+ when the UI lands; the MVP simply does not
follow references.

`dataCollection: 'none'`, `requiresAccount: false`,
`requiresInternetForCoreFeatures: false`, `offlineSupported: true`.

### 9. Entitlements

Free **shipped** (also the exact set in `manifest.entitlements.free`):

- Parse / format / minify / validate
- JSON Pointer path inspector
- Basic schema inference (types, required-ness)
- Textual diff (Phase 1.1a — `json.diff.textual` parser +
  `json.export.diff.textual` exporter)
- JSON pretty / minified, Markdown summary, plaintext paths, basic
  JSON Schema exports
- Save / load local workspace

Free **deferred to follow-up PRs** (will be added to
`manifest.entitlements.free` when their implementations land — they are
*not* declared there today, because unimplemented free features are
misleading advertising):

- Tree / table / text views (UI; `apps/web-suite` is still placeholder)
- Search across keys and values (UI)
- Copy path / copy value (UI)

Pro:

- Graph mode (depends on Phase 3 graph engine)
- Semantic diff (depends on Phase 3 semantic-diff engine)
- Migration studio (depends on Phase 3 migration-recipe engine)
- Batch transforms across multiple loaded documents
- Advanced schema inference: `oneOf`, `enum` collapse, format
  detection, sample expansion
- TypeScript / Zod generation
- Data-dictionary export
- Broken-reference detection in linked documents
- Duplicate-entity detection across linked documents

Free is genuinely useful on its own.

### 10. Out of scope

- Fetching `$ref` URLs.
- Executing programmable query languages (JSON-Logic, JSONata, etc.).
- Acting as a JSON Schema registry or remote validator.
- Streaming gigantic JSON documents — there is a soft size threshold;
  above it, Pro views are gated and certain operations are disabled.
- Anything that requires a server.

## `ToolManifest`

The canonical NekoJSON manifest lives at
[`packages/lens-json/src/manifest.ts`](../../packages/lens-json/src/manifest.ts).
It is the source of truth — this doc does not duplicate it, because
duplicated manifests drift.

The header comment in that file documents the reading model that the
PR #2 audit enforced:

- `entitlements.free` lists features this build ships with a working
  implementation. Unimplemented free features must not appear.
- `entitlements.pro` lists features a future paid build will ship via
  a private `@nekotools-pro/*` package. They appear here as honest
  advertising; the free build does not link any Pro implementation,
  so a free user cannot invoke them.
- `capabilities.*` reflect what this build can do right now, not
  lifetime promises of the tool family.
- `parsers` / `exporters` / `graphProjectors` may list ids that are
  Pro intent. The runtime registry only validates the forward direction
  (every *registered* implementation must be declared); it does not
  require every declared id to be registered.

The current MVP values are asserted by the monetization-safety tests
in [`conformance.test.ts`](../../packages/lens-json/src/__tests__/conformance.test.ts):
free entitlements match the exact MVP-backed set, deferred free
features are absent, Pro exporters are declared but not registered, no
graph projector is registered, and `runExporter` rejects every Pro
exporter id.

## What was deliberately undecided in Phase 1

Captured here before implementation so reviewers do not block on these
details. Decisions taken during implementation:

| Question | Decision in MVP |
| --- | --- |
| Tokenizer choice (hand-written vs library, in-tree vs dependency)   | None of the above — MVP wraps `JSON.parse`. An in-tree tokenizer with always-accurate spans is a follow-up PR. |
| Soft-size threshold value (~10–50 MB; benchmarked during impl)      | Not implemented in MVP. `json.large_document` code is reserved. |
| Whether `json.graph.references` ships as a stub or only declared     | Declared in the manifest as Pro intent; not registered in the free build. The `canProjectGraph` capability is `false` in the current build. |
| Strict vs non-strict parsing rules                                   | MVP is strict-only. Trailing-comma / comment / unquoted-key recovery deferred. |

## Acceptance for the Phase 1 implementation PR

- [x] `@nekotools/lens-json` package exists, registered via
      `buildJsonRegistration` + `ToolRegistry`.
- [x] Manifest passes `validateManifest`.
- [x] Free-tier parsers and exporters exist and pass tests
      (`json.text`, `json.pointer`; pretty, minified, markdown summary,
      plaintext paths, basic JSON Schema).
- [x] Conformance test parallel to `lens-binary` covers parser →
      diagnostic → export → workspace round-trip.
- [x] Offline guard sees no new violations.
- [x] Charter doc updated from "PROPOSED" to "IMPLEMENTED".
- [x] Pro-tier parsers/exporters declared in the manifest as honest
      advertising, with no implementation present in the public/free
      package set.

## Deferred from this PR (scope contract)

The implementation PR landed the **tight engine MVP** (user-chosen
scope). The following items remain charter-approved and will land in
explicit follow-up PRs, not silently:

| Deferred item                                      | Status        | Notes |
| -------------------------------------------------- | ------------- | ----- |
| `json.diff` artifact + textual diff exporter       | **Shipped — Phase 1.1a** | Line-level diff against a canonical (key-sorted) pretty-print. Semantic diff is still Pro. |
| Large-document threshold (`json.large_document`)   | Follow-up     | Diagnostic code reserved. Tracked as Phase 1.1b. |
| In-tree tokenizer with accurate spans              | Follow-up     | Current spans are best-effort from `JSON.parse` error messages. Tracked as Phase 1.1c. |
| Duplicate-key detection (`json.duplicate_key`)     | Follow-up     | Diagnostic code reserved. Tracked as Phase 1.1d, depends on the tokenizer. |
| Trailing-comma support (`json.trailing_comma`)     | Follow-up     | Diagnostic code reserved. Default mode is strict. Tracked as Phase 1.1d. |
| TS / Zod / data-dictionary exports                 | Pro (future)  | Declared in manifest. Implementation lives in a future private package. |
| Graph projector (`json.graph.references`)          | Pro (future)  | Declared in manifest. Phase 3 graph engine prerequisite. |
| Semantic diff, migration studio, batch transforms  | Pro (future)  | Declared in manifest. Phase 3 dependencies. |
| Advanced schema inference                          | Pro (future)  | `oneOf`, format detection, enum collapse, sample unification. |
| UI views (tree / table / text, search)             | Follow-up     | Tracked as Phase 1.1e. `apps/web-suite` is still a placeholder. |
