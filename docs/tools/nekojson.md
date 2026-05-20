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

- `json.text` — accepts raw JSON text, produces `json.document`.
  **Strict mode only.** Backed by `JSON.parse` for value-tree
  construction. Phase 1.1c wired the new in-tree tokenizer (see
  section 11 below) into the syntax-error path, so `json.syntax_error`
  diagnostics now carry **multi-character spans** pointing at the
  offending token (instead of the single-position span the V8
  `position N` regex was producing alone). `JSON.parse` still decides
  validity; the tokenizer's job is to give the diagnostic an accurate
  source location.
- `json.pointer` — accepts a JSON Pointer (`/foo/bar/0`) against a
  loaded `json.document`, produces `json.path-result`. This is a
  parser, not a runtime, because it converts user input (the pointer)
  into a structured artifact.

Non-strict parsing — trailing commas, comments, partial-artifact
recovery — **remains out of scope** for Phase 1. Phase 1.1d shipped
strict-mode *diagnostics* for the two most common offenders (duplicate
keys and trailing commas), not strict-mode parser relaxation:
`JSON.parse` still rejects trailing commas with a `json.syntax_error`;
the new `json.trailing_comma` warning rides alongside it. If
non-strict parsing is ever pursued, it will be a separate charter, not
a Phase 1 follow-up.

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
| `json.diff.missing_input`     | shipped  | error    | Textual diff invoked without both document hints (or with `undefined`). |
| `json.large_document`         | shipped (Phase 1.1b) | info | Input exceeds the soft size threshold. Informational only — heavy Pro projections will consume it to self-gate. |
| `json.trailing_comma`         | shipped (Phase 1.1d) | warning | A `,` token sits immediately before `]` or `}`. JSON.parse will also surface a `json.syntax_error`; this code points at the exact comma. |
| `json.duplicate_key`          | shipped (Phase 1.1d) | warning | An object has the same key twice. JSON.parse silently keeps the last value; this warning points at the second (and any later) occurrence and references the first occurrence's line/column. |

All Phase 1.1 diagnostic codes are now implemented — the reserved-only
list is empty. Any future diagnostic must be added through a PR that
updates [`diagnostics.ts`](../../packages/lens-json/src/diagnostics.ts),
the relevant tests, and this table in the same PR.

Phase 1.1c made syntax-error spans **tokenizer-assisted**: the in-tree
tokenizer (see Section 11) is consulted on `JSON.parse` failure to pick
a multi-character span pointing at the offending token. `JSON.parse`
still decides validity; the tokenizer only refines the diagnostic's
location. Remaining span work is the Phase 1.1d duplicate-key and
trailing-comma diagnostics, which walk the tokenizer's token stream
directly. No throwing anywhere; every malformed input produces
structured diagnostics.

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

Free **shipped Phase 1.1f** (in `manifest.entitlements.free`):

- Tree view (`view.tree`) — [`apps/web-suite/src/TreeView.tsx`](../../apps/web-suite/src/TreeView.tsx)
- Text view (`view.text`) — [`apps/web-suite/src/TextView.tsx`](../../apps/web-suite/src/TextView.tsx)

Free **shipped Phase 1.1g** (in `manifest.entitlements.free`):

- Table view (`view.table`) — [`apps/web-suite/src/TableView.tsx`](../../apps/web-suite/src/TableView.tsx)
- Search across keys and values (`search`) — [`apps/web-suite/src/search.ts`](../../apps/web-suite/src/search.ts) (wired into TreeView + TableView through App.tsx)

Free **shipped Phase 1.1h** (in `manifest.entitlements.free`):

- Copy path (`copy.path`) — [`apps/web-suite/src/clipboard.ts`](../../apps/web-suite/src/clipboard.ts) + button in `App.tsx`. Writes the active JSON Pointer through `navigator.clipboard.writeText` with a hidden-textarea + `document.execCommand('copy')` fallback. No network, no telemetry.
- Copy value (`copy.value`) — same helper, writes the JSON value at the active path. Uses [`apps/web-suite/src/pointer-resolve.ts`](../../apps/web-suite/src/pointer-resolve.ts) for RFC 6901 resolution (reuses `parsePointer` from lens-json).

**Phase 1 free tier is now closed.** Every charter-declared free
feature is implementation-backed in `manifest.entitlements.free`. Any
future free entitlement must land in a new PR that updates the
monetization-safety conformance test in the same commit.

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

### 11. Tokenizer (Phase 1.1c)

Source: [`packages/lens-json/src/tokenizer.ts`](../../packages/lens-json/src/tokenizer.ts).

A hand-written, in-tree JSON scanner. The tokenizer exists to give the
rest of NekoJSON a typed token stream with always-accurate source
spans. It does **not** validate JSON structure — `JSON.parse` still
decides whether an input is a valid JSON value tree.

Token kinds:

- structural: `lbrace`, `rbrace`, `lbracket`, `rbracket`, `colon`, `comma`
- literal:    `string` (raw + decoded value), `number` (raw + numeric value), `true`, `false`, `null`
- lexical error recovery: `error` (with `code` and `message`)

Every token carries a `JsonTokenSpan`:
`{ startOffset, endOffset, startLine, startColumn, endLine, endColumn }`.
Line / column are 1-indexed; offsets are JS string indices (UTF-16 code
units).

What Phase 1.1c uses the tokenizer for:

- `json.text`'s `json.syntax_error` diagnostic now consults the
  tokenizer to pick a multi-character span (the whole unterminated
  string, the whole malformed number, the whole token at the V8
  failure position) instead of the single-position span the regex
  alone produced.

What Phase 1.1d uses it for (shipped):

- `json.duplicate_key` — walker tracks an object-scope stack and
  emits a warning per duplicate string-token key. See
  `packages/lens-json/src/walker-diagnostics.ts`.
- `json.trailing_comma` — same walker emits at the comma immediately
  before `}` or `]`.

Out of scope for the tokenizer:

- Non-strict modes (comments, trailing commas in the stream are
  reported by 1.1d, not silently allowed at the lexer).
- Building a JSON value tree.
- Streaming / incremental tokenization. The function is whole-string.

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
| Tokenizer choice (hand-written vs library, in-tree vs dependency)   | **Phase 1.1c: hand-written in-tree scanner** ([`packages/lens-json/src/tokenizer.ts`](../../packages/lens-json/src/tokenizer.ts)). Emits a typed `JsonToken` stream with always-accurate `startOffset`/`endOffset`/line/column spans, recognizes every JSON token kind, and emits `kind: 'error'` tokens for lexical problems (unterminated string, malformed number, invalid escape, unexpected character). `JSON.parse` still builds the value tree; the tokenizer feeds the syntax-error diagnostic path and unlocks Phase 1.1d's duplicate-key / trailing-comma detection. |
| Soft-size threshold value (~10–50 MB; benchmarked during impl)      | Phase 1.1b: set at the conservative end — **10 MB** (`DEFAULT_LARGE_DOCUMENT_BYTES = 10 * 1024 * 1024`). Configurable per-registration via `buildJsonRegistration(clock, { largeDocumentBytes })`. The diagnostic is `info` severity; nothing in the free build is blocked above it. |
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
| Large-document threshold (`json.large_document`)   | **Shipped — Phase 1.1b** | `json.text` emits `info` diagnostic when input exceeds the soft threshold (default 10 MB). Configurable. |
| In-tree tokenizer with accurate spans              | **Shipped — Phase 1.1c** | Hand-written scanner at [`src/tokenizer.ts`](../../packages/lens-json/src/tokenizer.ts). Wired into `json.text`'s syntax-error path; ready to be consumed by Phase 1.1d's `json.duplicate_key` and `json.trailing_comma` diagnostics. |
| Duplicate-key detection (`json.duplicate_key`)     | **Shipped — Phase 1.1d** | Walker over the tokenizer stream; warning per duplicate, with first-occurrence line/column in the message. JSON.parse still produces the document. |
| Trailing-comma support (`json.trailing_comma`)     | **Shipped — Phase 1.1d** | Walker emits a warning at the comma's exact span. JSON.parse still rejects the input via `json.syntax_error`; both diagnostics ship together. |
| TS / Zod / data-dictionary exports                 | Pro (future)  | Declared in manifest. Implementation lives in a future private package. |
| Graph projector (`json.graph.references`)          | Pro (future)  | Declared in manifest. Phase 3 graph engine prerequisite. |
| Semantic diff, migration studio, batch transforms  | Pro (future)  | Declared in manifest. Phase 3 dependencies. |
| Advanced schema inference                          | Pro (future)  | `oneOf`, format detection, enum collapse, sample unification. |
| UI shell + manifest panel                          | **Shipped — Phase 1.1e** | `apps/web-suite` scaffold + UI charter at [`docs/tools/nekojson-ui.md`](nekojson-ui.md). |
| Tree view + Text view                              | **Shipped — Phase 1.1f** | [`TreeView.tsx`](../../apps/web-suite/src/TreeView.tsx) + [`TextView.tsx`](../../apps/web-suite/src/TextView.tsx). |
| Table view + Search across keys/values             | **Shipped — Phase 1.1g** | [`TableView.tsx`](../../apps/web-suite/src/TableView.tsx) + [`search.ts`](../../apps/web-suite/src/search.ts). |
| Copy path + Copy value                             | **Shipped — Phase 1.1h** | Local-clipboard affordances. [`clipboard.ts`](../../apps/web-suite/src/clipboard.ts) + buttons in App. `manifest.entitlements.free` now includes `copy.path` + `copy.value`. **Phase 1 free tier closed.** |
