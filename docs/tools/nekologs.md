# NekoLogs — Phase 2 charter (NekoLogs 2.0)

> Status: **PROPOSED.** This PR is charter-only. No implementation
> code under `packages/lens-logs/*`, no manifest registration, and no
> `apps/web-suite` wiring ship in this PR. Implementation is blocked
> until this charter is approved and merged.

NekoLogs is the third Phase 2 tool, after NekoEnv. Where NekoEnv
proved the spine fits a flat line-oriented `key=value` substrate,
NekoLogs proves it fits a **heterogeneous record stream**: an ordered
sequence of log lines that may be JSON-per-line, logfmt, or
unstructured plaintext, each carrying an optional timestamp and
severity level. That is a structurally different shape from both
NekoJSON (a recursive value tree) and NekoEnv (a flat map), and it is
the point of choosing NekoLogs as the next reuse-gate test.

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
| `log.summary`        | Aggregate stats over a `log.document`: total entries, counts by level, parsed time range, count of unparseable lines, and the top-N most frequent normalized messages. Basic aggregation only. | Phase 2.x.1, free. |
| `log.histogram`      | A count matrix: entries bucketed by `(level × time-bucket)`. The "matrix" projection NekoLogs exercises. Basic fixed-bucket histogram is free intent; adaptive bucketing / anomaly overlay is Pro. | Free (basic) / Pro (advanced). |

Every kind is namespaced under `log.*`. None are reused from `json.*`
or `env.*`, even where a shape looks superficially similar.

### 2. Parser contract

Reuses `@nekotools/contracts`'s `Parser<TArtifact>`. New parsers:

- `log.text` — accepts raw log text, produces `log.document`. Splits
  on line breaks and classifies each line with a **per-line format
  detector**:
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

## Draft `ToolManifest` (illustrative)

The TS object lands in the Phase 2.x.1 engine PR under
`packages/lens-logs/src/manifest.ts`, schema-validated by
`validateManifest`. The shape below is illustrative for the auditor;
the strings are the source of truth for the implementation's free/Pro
identifier set.

```ts
// packages/lens-logs/src/manifest.ts (preview only, not committed here)
export const logsManifest: ToolManifest = {
  version: 1,
  id: 'logs',
  name: 'NekoLogs',
  toolVersion: 1,
  summary:
    'Parse, filter, summarize, and export local log snapshots. Phase 2 reuse-gate tool.',
  artifactKinds: ['log.document', 'log.filter-result', 'log.summary', 'log.histogram'],
  parsers: ['log.text', 'log.filter'],
  exporters: [
    'log.export.text.plain',
    'log.export.plaintext.messages',
    'log.export.json.entries',
    'log.export.csv.entries',
    'log.export.markdown.summary',
    'log.export.report.incident',   // Pro intent
    'log.export.histogram.svg',     // Pro intent
    'log.export.patterns.clusters', // Pro intent
  ],
  graphProjectors: ['log.graph.trace'], // Pro intent
  offlinePolicy: DEFAULT_OFFLINE_POLICY,
  capabilities: {
    canSaveWorkspace: true,
    canExport: true,
    canDiff: false, // semantic log diff is Pro; no free diff in this tool
    canProjectGraph: false,
  },
  entitlements: {
    free: [
      // Phase 2.x.1 engine MVP.
      'parse',
      'validate',
      'filter',
      'summary.basic',
      'histogram.basic',
      'export.text.plain',
      'export.plaintext.messages',
      'export.json.entries',
      'export.csv.entries',
      'export.markdown.summary',
      'workspace.save',
      // Phase 2.x.2 UI free entitlements (view.table, view.text,
      // view.summary, search, filter.ui, copy.line, copy.message)
      // are added in the UI PR, not the engine PR.
    ],
    pro: [
      'anomaly.detect',
      'pattern.cluster',
      'histogram.advanced',
      'graph.trace',
      'report.incident',
      'diff.semantic',
      'query.saved',
    ],
  },
  outOfScope: [
    'live tailing or following a file/directory',
    'remote log ingestion or shipping (syslog, HTTP collector, agents)',
    'executing a programmable query language (Lucene, LogQL, SQL, KQL)',
    'acting as a durable log storage backend',
    'fetching anything referenced inside a log line',
    'streaming gigantic logs beyond the local soft threshold',
  ],
};
```

## What this PR does *not* include

- Any code under `packages/lens-logs/`. The package directory does
  not exist yet; it lands in the Phase 2.x.1 engine PR.
- The `@nekotools/lens-kit` extraction. That fires in the engine PR
  (see Section 7), not in this charter PR.
- Any change to `@nekotools/contracts`, `@nekotools/schemas`,
  `@nekotools/tool-runtime`, `@nekotools/offline-guard`,
  `@nekotools/lens-binary`, `@nekotools/lens-json`,
  `@nekotools/lens-env`, or `apps/web-suite`.
- Any change to CI workflows.
- A merged manifest registration.

## Acceptance for the Phase 2.x.1 implementation PR

(Preview — these gates apply to the engine PR, not to this charter PR.)

- [ ] `@nekotools/lens-logs` package exists, registered via a
      `buildLogsRegistration(clock, options?)` factory + the existing
      `ToolRegistry`.
- [ ] `@nekotools/lens-kit` shared helper exists; `lens-binary`,
      `lens-json`, `lens-env`, and `lens-logs` all consume it; the
      four duplicated `util.ts` copies are deleted; all existing
      tests still pass.
- [ ] Manifest passes `validateManifest`.
- [ ] Free-tier parsers + exporters exist and pass tests
      (`log.text`, `log.filter`, plus every free exporter from
      Section 4 across JSON-per-line / logfmt / plaintext inputs).
- [ ] Conformance test parallel to `lens-env` covers parser →
      diagnostic → export → workspace round-trip, including a
      multi-artifact workspace.
- [ ] Monetization-safety tests parallel to NekoEnv's: free
      entitlements match the exact MVP-backed set, Pro exporters are
      declared but not registered, `log.graph.trace` is declared but
      not registered, and `runExporter` rejects every Pro exporter
      id.
- [ ] Offline guard sees no new violations.
- [ ] This charter doc updated from "PROPOSED" to "IMPLEMENTED" in
      the engine PR.

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
