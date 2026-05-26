# NekoLogs — Phase 2 charter (NekoLogs 2.0)

> Status: **IMPLEMENTED — Phase 2 free tier closed (Phase 2.x.2 UI).**
> The charter was approved in
> [PR #15](https://github.com/cmclicker/NekoTools/pull/15); the engine
> implementation (`@nekotools/lens-logs`) plus the
> `@nekotools/lens-kit` extraction landed in the Phase 2.x.1
> implementation PR; the Phase 2.x.2 UI shipped in `apps/web-suite`
> (NekoLogs is the third tool tab — table / text / summary views,
> structured-filter control, free-text search, copy.line / copy.message).
> Every charter-declared free capability now has a working
> implementation declared in `manifest.entitlements.free`: engine
> entries live in `@nekotools/lens-logs`, UI entries live in
> `apps/web-suite` (`LogsApp` + `LogTableView` / `LogTextView` /
> `LogSummaryView` / `LogFilterControl`). Future free entitlements
> must be added only in the same PR that ships their implementation,
> per the open-core governance rule. Deferred (Pro / future) items are
> listed under "Deferred from this PR" at the bottom.

NekoLogs is the **second Phase 2 tool, after NekoEnv** — and the
**third major substrate** the platform has been tested against, after
JSON and dotenv. Where NekoEnv proved the spine fits a flat
line-oriented `key=value` substrate, NekoLogs proves it fits a
**heterogeneous record stream**: an ordered sequence of log lines that
may be JSON-per-line, logfmt, or unstructured plaintext, each carrying
an optional timestamp and severity level. That is a structurally
different shape from both NekoJSON (a recursive value tree) and
NekoEnv (a flat map), and it is the point of choosing NekoLogs as the
next reuse-gate test.

## What NekoLogs is

A local, offline log workbench. The user pastes, drops, or opens a
chunk of log output. NekoLogs parses each line into a structured
entry (timestamp, level, message, fields), lets the user filter by
level / time / text / field, summarizes the document (counts by
level, time range, top messages), and exports a result. No network.
No live tailing. No account. No sync.

## What NekoLogs is *not*

- A live tailer. NekoLogs analyzes a **snapshot** the user handed it.
  It does not follow a file, watch a directory, or stream new lines
  as they are written — that requires a running process with
  filesystem watch privileges, which is a different product.
- A log shipper / collector. No syslog server, no HTTP ingest
  endpoint, no remote backend. NekoLogs never receives logs over a
  socket and never forwards them anywhere.
- A query-language runtime. Filtering is a **structured** filter
  (level threshold, text contains, field equals, time range), not a
  programmable language. NekoLogs does not execute Lucene, LogQL,
  SQL, KQL, or any other query DSL — the same line NekoJSON drew at
  JSON-Logic / JSONata.
- A storage backend. NekoLogs holds the snapshot you gave it in
  memory for the session. It is not a place to durably store logs.

## The 10 charter questions

### 1. Artifact kind

NekoLogs introduces:

| Kind                 | Value                                                                          | Status         |
| -------------------- | ------------------------------------------------------------------------------ | -------------- |
| `log.document`       | A parsed log document: an ordered list of `LogEntry` records (timestamp?, level?, message, fields, raw, source line number) plus the detected line format. | Phase 2.x.1, free. |
| `log.filter-result`  | The ordered subset of a `log.document`'s entries that match a structured filter, plus the filter that produced it. Parallel to NekoJSON's `json.path-result` and NekoEnv's `env.key-result` — a parser turns user input (the filter) into an artifact. | Phase 2.x.1, free. |
| `log.summary`        | Aggregate stats over a `log.document`: total entries, counts by level, parsed time range, count of unparseable lines, and the top-N most frequent normalized messages. Basic aggregation only. **Produced by the `log.text` parser run** (see Section 2), not a separate aggregator stage. | Phase 2.x.1, free. |
| `log.histogram`      | A count matrix: entries bucketed by `(level × time-bucket)`. The "matrix" projection NekoLogs exercises. **Produced by the `log.text` parser run.** Basic fixed-bucket histogram is free; adaptive bucketing / anomaly overlay is Pro. | Free (basic) / Pro (advanced). |

Every kind is namespaced under `log.*`. None are reused from `json.*`
or `env.*`, even where a shape looks superficially similar.

**How the derived artifacts are produced.** A single `log.text`
parser run emits three artifacts: the primary `log.document`, plus a
`log.summary` and a basic `log.histogram` derived from it in the same
pass. This keeps the engine MVP to two parsers (`log.text`,
`log.filter`) and avoids inventing a new aggregator runtime stage or
contract — the derived artifacts ride out of the existing
`ParserResult.artifacts` array, exactly as a parser is already allowed
to return more than one artifact. See Section 2 for the parser
contract and Section 5 for why the histogram is a value-shape, not a
new contract.

### 2. Parser contract

Reuses `@nekotools/contracts`'s `Parser<TArtifact>`. New parsers:

- `log.text` — accepts raw log text and produces **three artifacts in
  one run**: the primary `log.document`, plus a derived `log.summary`
  (basic counts by level, time range, unparseable count, top
  normalized messages) and a derived basic `log.histogram` (fixed
  `level × time-bucket` count matrix). All three come out of the same
  `ParserResult.artifacts` array — no second runtime stage, no
  aggregator contract. The `log.summary` / `log.histogram`
  computations are pure functions of the parsed `log.document`, so the
  derived artifacts cannot drift from the document they describe. The
  parser splits on line breaks and classifies each line with a
  **per-line format detector**:
  - **JSON-per-line** — the line parses as a JSON object; known
    fields (`time`/`timestamp`/`ts`, `level`/`lvl`/`severity`,
    `msg`/`message`) are lifted into the entry, the rest become
    `fields`.
  - **logfmt** — the line is a run of `key=value` pairs; the same
    known fields are lifted. (This deliberately reuses the *lessons*
    of NekoEnv's `key=value` scanner, but NekoLogs ships its own
    line scanner — see Section 7 on why it is not a literal reuse.)
  - **plaintext** — fallback. A small set of conservative regexes
    pulls a leading ISO-8601 / common timestamp and a bracketed or
    prefixed level (`[ERROR]`, `WARN:`) if present; everything else
    is the `message`. A line that yields no structure is still a
    valid entry with `message = raw line`.
  The detector never throws; an undetectable line becomes a
  plaintext entry and (optionally) raises `log.unparseable_line`.
- `log.filter` — accepts a **structured filter** (passed via
  `input.hints`, not a parsed DSL string) against a loaded
  `log.document`, produces `log.filter-result`. Supported predicates:
  `minLevel`, `levelIn`, `messageContains` (case-insensitive
  substring), `fieldEquals` (`{ key, value }`), `since` / `until`
  (timestamps). Predicates combine with AND. This is a parser, not a
  runtime, for the same reason `json.pointer` / `env.key` are: it
  turns user input into a structured artifact.

No `log.url` parser. NekoLogs never fetches. No streaming/incremental
parser — the function is whole-snapshot, like NekoJSON's tokenizer.

### 3. Diagnostic contract

Reuses the existing `Diagnostic` shape. Codes shipping in the
Phase 2.x.1 engine MVP:

| Code                       | Severity | Meaning |
| -------------------------- | -------- | ------- |
| `log.empty_input`          | info     | Input is whitespace only. Produces an empty `log.document` (mirror of `env.empty_input`'s artifact-emission policy). |
| `log.unparseable_line`     | info     | A line yielded no timestamp, level, or structured fields and was kept as a plaintext message. Informational — a free-text log line is not an error. Emitted at most once per document with a count, not once per line, to avoid diagnostic spam. |
| `log.mixed_formats`        | info     | The document mixes detected line formats (e.g. JSON-per-line and plaintext). Informational; NekoLogs handles the mix, but the user may want to know. |
| `log.timestamp_unparsed`   | info     | One or more entries had a leading token that looked like a timestamp but did not parse against the known formats; those entries have no `timestamp`. Emitted once with a count. |
| `log.large_document`       | info     | Input exceeds the soft size threshold (same `TextEncoder` byte-count + per-registration knob as NekoJSON / NekoEnv). Informational only. |
| `log.filter.invalid`       | error    | The structured filter passed to `log.filter` was malformed (e.g. `minLevel` not a known level, `since` not a parseable timestamp). |

Codes deliberately **not** in the engine MVP (each must arrive via a
follow-up PR that updates this table):

- `log.anomaly` (Pro) — statistical/level-spike anomaly markers.
- `log.pattern_cluster` (Pro) — "these 4,000 lines are the same
  template" clustering.

All malformed inputs produce structured diagnostics. The parsers do
not throw.

### 4. Export contract

Reuses the `Exporter<TArtifact>` interface. Targets for the engine
MVP:

| Exporter id                          | Target      | Audience | Free / Pro |
| ------------------------------------ | ----------- | -------- | ---------- |
| `log.export.text.plain`              | plaintext   | Re-emit (filtered) entries as plain log lines. | Free |
| `log.export.plaintext.messages`      | plaintext   | Just the messages, one per line. Useful for grep/diff workflows. | Free |
| `log.export.json.entries`            | json        | Entries as a structured JSON array (timestamp/level/message/fields). | Free |
| `log.export.csv.entries`             | csv         | Entries as CSV (timestamp, level, message, + flattened fields). First NekoTools use of the `csv` `ExportTarget`. | Free |
| `log.export.markdown.summary`        | markdown    | A `log.summary` rendered as a Markdown report: counts by level, time range, top messages, unparseable count. | Free |
| `log.export.report.incident`         | markdown    | A richer incident report (error timeline, correlated fields, suspected root-cause window). | Pro |
| `log.export.histogram.svg`           | html        | A standalone inline-SVG level×time histogram. | Pro |
| `log.export.patterns.clusters`       | json        | Clustered message templates with counts. | Pro |

All exports run locally. None of them ship the data anywhere.

### 5. Graph / table / matrix primitive

This is where NekoLogs adds the most reuse-gate value: it exercises
the **matrix** projection that NekoJSON and NekoEnv did not.

- **Table** is the primary view: entries as rows
  `(time, level, message, fields)`. UI work (Phase 2.x.2); reuses the
  shell's existing table primitive — no new contract.
- **Text** view: raw source with line-number gutter + per-line
  level coloring. UI work; reuses NekoJSON's generic
  `groupSeverityByLine` gutter pattern.
- **Matrix / histogram** (`log.histogram`): counts bucketed by
  `(level × time-bucket)`. The basic fixed-bucket histogram is free
  intent (a `log.summary`-adjacent aggregation + a simple UI bar
  view); adaptive bucketing, zoom, and anomaly overlay are Pro.
  **This is a new artifact value-shape, not a new contract** — it is
  an `Artifact<'log.histogram', …>` rendered by an exporter / UI,
  exactly as `json.diff` and `env.diff` were new value-shapes over
  the same `Artifact` interface.
- **Graph** (Pro): a correlation/trace projection
  (`log.graph.trace`) linking entries that share a request-id /
  trace-id into call sequences. Depends on the Phase 3 graph engine.
  Declared in the manifest as advertising; not registered in the
  free build. `capabilities.canProjectGraph = false` in the
  engine-MVP manifest.

### 6. Workspace

**Reuses the existing Phase 0 `Workspace` shape and the
`jsonWorkspaceSerializer` from `@nekotools/tool-runtime`. NekoLogs
introduces no new workspace contract.** A NekoLogs workspace is a
`Workspace` whose artifacts have kind `log.*`. The conformance test
will prove lossless round-trip for `log.document` (and a
multi-artifact case with a `log.filter-result` + `log.summary`),
mirroring NekoEnv's Phase 2.1 conformance suite.

`uiState` fields consumed by the Phase 2.x.2 UI PR:

- `uiState.viewMode` — `table | text | summary`.
- `uiState.filter` — the active structured filter.
- `uiState.searchQuery` — the most recent free-text search.
- `uiState.activeLine` — last selected source line / entry index.

### 7. Reuse

NekoLogs reuses, in priority order:

| Existing package          | Reused for                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `@nekotools/contracts`    | Every contract. NekoLogs introduces **no new contract types** — only new artifact-kind strings, parser ids, diagnostic codes, and exporter ids. |
| `@nekotools/schemas`      | Workspace + artifact + manifest schema validation. The artifact-kind validator already accepts any `log.*` string; no schema change required. |
| `@nekotools/tool-runtime` | Registry, parser runner, export runner, workspace serializer, entitlement gate. NekoLogs registers exactly like NekoJSON and NekoEnv. |
| `apps/web-suite`          | The Phase 2.2 tool-tabs shell. NekoLogs becomes the **third tab** (`NekoJSON` \| `NekoEnv` \| `NekoLogs`) using the same `App` switcher, paste card, results card, view-mode fieldset, search input, copy buttons, and the generic `groupSeverityByLine` text-gutter helper. |

**The `clock` + `makeIdFactory` helper extraction fires here.** The
pattern has been duplicated in `lens-binary` (origin), `lens-json`
(1st reuse), and `lens-env` (2nd reuse). NekoLogs is the **3rd
reuse**, which crosses the "duplicated more than twice" threshold
from NekoJSON's charter §7 ("If duplicated more than twice across
tools, it is extracted in a follow-up PR"). Therefore the Phase
2.x.1 NekoLogs **engine implementation PR** will:

1. Extract `Clock`, `FIXED_CLOCK`, and `makeIdFactory` into a small
   shared package (working name `@nekotools/lens-kit`), and
2. Re-point `lens-binary`, `lens-json`, `lens-env`, and the new
   `lens-logs` at it, deleting the four duplicated `util.ts` copies.

That extraction is a deliberate, charter-anticipated refactor — not
scope creep — and it is the single cross-cutting change the NekoLogs
engine PR is allowed to make outside `packages/lens-logs/*`. Calling
it out here means the auditor sees it coming.

NekoLogs does **not**:

- Invent a new artifact root, workspace shape, or runtime mechanism.
- Reuse NekoEnv's `key=value` scanner literally — logfmt parsing
  inside a log line has different escaping/quoting rules and a
  different fallback contract (an unrecognized logfmt line is a
  plaintext message, not a syntax error), so NekoLogs ships its own
  small line scanner. If a third `key=value`-shaped consumer appears
  later, *that* is when a shared kv-scanner is extracted — same
  "wait for the third occurrence" discipline.

### 8. Offline policy

`networkPolicy: 'network-forbidden'`.

NekoLogs never opens a socket, never ingests over the network, never
ships logs anywhere, and never resolves anything remotely. A value
that looks like a URL inside a log message is rendered as text, never
fetched.

`dataCollection: 'none'`, `requiresAccount: false`,
`requiresInternetForCoreFeatures: false`, `offlineSupported: true`.

### 9. Entitlements

The exact free / Pro split lands in `manifest.entitlements.free` /
`.pro` across the two implementation PRs. Every free entry is
implementation-backed in the same PR that adds it, per the open-core
governance rule.

**Free (Phase 2.x.1 engine MVP):**

- `parse` — `log.text` parser with per-line format detection.
- `validate` — the diagnostics from Section 3.
- `filter` — `log.filter` structured-filter parser.
- `summary.basic` — `log.summary` aggregation.
- `histogram.basic` — fixed-bucket `log.histogram`.
- Exports: `log.export.text.plain`, `log.export.plaintext.messages`,
  `log.export.json.entries`, `log.export.csv.entries`,
  `log.export.markdown.summary`.
- `workspace.save` — workspace round-trip via the shared serializer.

**Free (Phase 2.x.2 UI):**

- `view.table`, `view.text`, `view.summary` — three NekoLogs view
  modes in `apps/web-suite`.
- `search` — free-text search across rendered entries.
- `filter.ui` — the structured-filter control surface (level
  dropdown, text box, field/time inputs) that drives `log.filter`.
- `copy.line`, `copy.message` — local clipboard via the shared
  `clipboard.ts` helper.

**Pro (advertising — implementation in future private package):**

- `anomaly.detect` — `log.anomaly` diagnostics.
- `pattern.cluster` — `log.pattern_cluster` + clusters export.
- `histogram.advanced` — adaptive bucketing, zoom, anomaly overlay.
- `graph.trace` — `log.graph.trace` correlation projection.
- `report.incident` — incident-report export.
- `diff.semantic` — semantic diff between two log captures
  ("what's new since last run").
- `query.saved` — saved/named filter sets.

Free is genuinely useful on its own: parse mixed-format logs, filter
by level/text/field/time, summarize, see a basic histogram, and
export to text / JSON / CSV / Markdown — entirely offline.

### 10. Out of scope

- Live tailing / following a file or directory.
- Remote log ingestion or shipping (syslog, HTTP collector, agents).
- Executing a programmable query language (Lucene, LogQL, SQL, KQL).
- Acting as a durable log storage backend.
- Fetching anything referenced inside a log line.
- Streaming gigantic logs beyond the local soft threshold (the
  histogram and Pro projections may gate above it).

## `ToolManifest`

The canonical NekoLogs manifest lives at
[`packages/lens-logs/src/manifest.ts`](../../packages/lens-logs/src/manifest.ts).
It is the source of truth — this doc does not duplicate it, because
duplicated manifests drift. (The charter PR carried an illustrative draft
block here; once the engine landed in the Phase 2.x.1 PR the draft was
replaced by this pointer, matching the NekoJSON and NekoEnv charters.)

The manifest declares two parsers — `log.text` (which emits
`log.document` + `log.summary` + `log.histogram` in one run) and
`log.filter` — the free exporter set (`text.plain`, `plaintext.messages`,
`json.entries`, `csv.entries`, `markdown.summary`), the Pro-intent ids
declared-but-not-registered in the free build (`report.incident`,
`histogram.svg`, `patterns.clusters`, and the `log.graph.trace`
projector), and `capabilities.canDiff = canProjectGraph = false`. It is
schema-validated by `validateManifest` and pinned by the
monetization-safety tests in
[`conformance.test.ts`](../../packages/lens-logs/src/__tests__/conformance.test.ts).

## What the engine MVP PR does *not* include

(Phase 2.x.1 engine scope.)

- No `apps/web-suite` UI integration. (Phase 2.x.2.)
- No Phase 2.x.2 UI entitlements in `manifest.entitlements.free`.
- No Pro implementation under `@nekotools-pro/*`.
- No change to `@nekotools/contracts`, `@nekotools/schemas`,
  `@nekotools/tool-runtime`, or `@nekotools/offline-guard`. (The
  `@nekotools/lens-kit` extraction *does* touch `lens-binary`,
  `lens-json`, and `lens-env` — that is the single charter-anticipated
  cross-cutting change; see Section 7.)
- No change to CI workflows.

## Acceptance for the Phase 2.x.1 implementation PR

All gates met in the engine PR:

- [x] `@nekotools/lens-logs` package exists, registered via
      `buildLogsRegistration(clock, options?)` + the existing
      `ToolRegistry`. ([`packages/lens-logs/src/index.ts`](../../packages/lens-logs/src/index.ts))
- [x] `@nekotools/lens-kit` shared helper exists; `lens-binary`,
      `lens-json`, `lens-env`, and `lens-logs` all consume it; the
      duplicated `Clock`/`makeIdFactory` copies are removed
      (`lens-json` / `lens-env` `util.ts` deleted; `lens-binary`
      `util.ts` keeps only its hex helpers and re-exports the kit
      trio); all existing tests still pass.
- [x] Manifest passes `validateManifest`.
- [x] Free-tier parsers + exporters exist and pass tests
      (`log.text`, `log.filter`, plus every free exporter from
      Section 4 across JSON-per-line / logfmt / plaintext inputs).
- [x] A single `log.text` run emits `log.document` + `log.summary` +
      basic `log.histogram`, and tests assert the derived artifacts
      are consistent with the document (pure-function property).
- [x] Conformance test parallel to `lens-env` covers parser →
      diagnostic → export → workspace round-trip, including a
      multi-artifact workspace.
- [x] Monetization-safety tests parallel to NekoEnv's: free
      entitlements match the exact MVP-backed set, Pro exporters are
      declared but not registered, `log.graph.trace` is declared but
      not registered, and `runExporter` rejects every Pro exporter
      id.
- [x] Offline guard sees no new violations.
- [x] This charter doc updated from "PROPOSED" to "IMPLEMENTED".

## Phase 2.x.2 UI

The UI ships in `apps/web-suite`. The shell now hosts three tools
side-by-side via the top-level tool tab (`NekoJSON` | `NekoEnv` |
`NekoLogs`), mounted on first render via `App`'s `initialTool` prop
(defaults to `'json'` for backward compatibility). The inactive panels
stay mounted-but-`hidden`, so pasted text, view mode, active line,
search query, and filter survive tab switches.

NekoLogs UI surface:

- **Table view** (default) — one row per entry: Line / Time / Level /
  Message, with a per-level color chip. Renders the document's entries,
  or the active filter's entries when a structured filter is set. A
  click selects the row (active line) and enables copy.
- **Text view** — raw source with a line-number gutter and per-line
  diagnostic markers, reusing NekoJSON's generic `groupSeverityByLine`.
- **Summary view** — the `log.summary` (total, per-level counts, parsed
  time range, unparseable count, top normalized messages) plus a basic
  fixed-bucket `log.histogram` rendered as hand-drawn CSS bars
  (`level × time` segments + an untimed tally). No charting library;
  adaptive bucketing / zoom / anomaly overlay remain Pro.
- **Structured-filter control** — inputs for `minLevel` (select),
  `messageContains`, `fieldEquals` (key + value), and `since` / `until`
  that build a plain `LogFilter` object and drive the engine's
  `log.filter` parser. It is **not** a query DSL — a malformed value
  (unknown level, unparseable timestamp) fails closed in the engine and
  surfaces as a `log.filter.invalid` diagnostic; the table falls back to
  the full document.
- **Search** — case-insensitive free-text narrowing over message +
  level + fields, layered on top of whatever the structured filter
  produced.
- **Copy line / Copy message** — local clipboard via the shared
  `clipboard.ts` helper (Clipboard API → hidden-textarea `execCommand`
  fallback). Copy line writes the entry's `raw`; copy message writes the
  parsed `message`.

## Deferred from this PR (Pro / future)

| Deferred item | Target | Notes |
| ------------- | ------ | ----- |
| `log.anomaly` / `log.pattern_cluster` diagnostics | Pro (future) | Statistical anomaly + template clustering. |
| `log.graph.trace` correlation projector | Pro (future) | Depends on the Phase 3 graph engine. |
| Advanced histogram (adaptive bucketing, anomaly overlay) | Pro (future) | Basic fixed-bucket histogram ships free here. |
| Incident report / histogram-SVG / clusters exports | Pro (future) | Declared in manifest; implementation in `@nekotools-pro/*`. |
| Semantic log diff, saved filter sets | Pro (future) | Depends on Phase 3 engines / future UI work. |

## Why this is the right next Phase 2 tool

1. **It exercises a third distinct substrate.** Tree (JSON) → flat
   map (Env) → heterogeneous record stream (Logs). If the spine only
   fit the first two shapes, this is where it would crack.
2. **It exercises the matrix projection** (`log.histogram`) that the
   first two tools did not, and the `csv` export target that no tool
   has used yet — both over the existing contracts, no new types.
3. **It fires the reuse rule on schedule.** The third reuse of the
   clock/id-factory pattern triggers the extraction NekoJSON's
   charter promised — proof the governance rule is real, not
   decorative.
4. **It has a well-understood domain.** Logs are a folk standard;
   reviewers can judge correctness without deep domain expertise.
5. **It is genuinely useful offline.** Paste a log dump, filter to
   errors in a time window, summarize, export to CSV — no service,
   no upload.
