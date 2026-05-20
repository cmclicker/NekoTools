# NekoJSON — Phase 1 charter

> Status: **PROPOSED.** This document is the charter pass required by
> [`tool-charter.md`](../tool-charter.md). No NekoJSON implementation
> code may land until this charter is approved.

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

| Kind                 | Value                                                       | Notes |
| -------------------- | ----------------------------------------------------------- | ----- |
| `json.document`      | The parsed root value of a JSON document.                   | Free. |
| `json.path-result`   | The value(s) at a JSON Pointer / structural path.           | Free. |
| `json.schema`        | An inferred or imported JSON Schema document.               | Free (basic inference) / Pro (advanced). |
| `json.diff`          | A structural diff between two `json.document` artifacts.    | Pro (semantic diff); basic textual diff is free. |

Every kind is namespaced under `json.*`. None of them have any meaning
outside NekoJSON.

### 2. Parser contract

Reuses `@nekotools/contracts`'s `Parser<TArtifact>`. New parsers:

- `json.text` — accepts raw JSON text, produces `json.document`. Emits
  spanned diagnostics for syntax errors. Best-effort: a single trailing
  comma produces a warning + a partial artifact instead of an empty
  result.
- `json.pointer` — accepts a JSON Pointer (`/foo/bar/0`) against a
  loaded `json.document`, produces `json.path-result`. This is a
  parser, not a runtime, because it converts user input (the pointer)
  into a structured artifact.

No `json.url` parser. NekoJSON never fetches.

### 3. Diagnostic contract

Reuses the existing `Diagnostic` shape. New codes (non-exhaustive):

| Code                          | Severity | Meaning |
| ----------------------------- | -------- | ------- |
| `json.syntax_error`           | error    | The text is not valid JSON. |
| `json.trailing_comma`         | warning  | Comma before `]` or `}` (non-strict mode). |
| `json.duplicate_key`          | warning  | Object has the same key twice. |
| `json.empty_input`            | error    | Input was whitespace only. |
| `json.large_document`         | info     | Document exceeds a soft size threshold; some Pro views are gated. |
| `json.pointer.unresolved`     | error    | A JSON Pointer did not resolve. |

Spans are populated from a tracking tokenizer so the UI can highlight
the offending byte range. No throwing; every malformed input produces
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
| `json.export.types.typescript`    | plaintext   | Generated TypeScript interfaces. | Pro |
| `json.export.types.zod`           | plaintext   | Generated Zod schema. | Pro |
| `json.export.docs.data-dictionary`| markdown    | Multi-document data dictionary with examples. | Pro |

All exports run locally. None of them ship the data anywhere.

### 5. Graph / table / matrix primitive

Free: a **table** projection over object arrays — flatten `arr[*]` into
a row-per-element view. Implemented using the existing artifact model
(no new contract).

Pro: a **graph** projection (`GraphProjector`) that maps object
references (by id, by `$ref`, by user-configured key) into nodes and
edges. Pro because it depends on the Phase 3 graph engine, which is
where the actual rendering and layout work lives. The charter declares
the projector so the manifest is honest, but the implementation only
ships in the Pro build.

### 6. Workspace

Reuses the existing `Workspace` shape. Persists:

- The loaded `json.document` artifact(s) (typically one, but two for a
  diff session).
- Diagnostics produced during the session.
- `uiState.activePath` — last selected JSON Pointer.
- `uiState.viewMode` — `tree | table | text`.
- `uiState.searchQuery` — the most recent search.
- `notes` — free-text user notes.

A NekoJSON workspace is portable: it round-trips losslessly through the
`jsonWorkspaceSerializer` shipped in Phase 0.

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

NekoJSON does not fetch `$ref` URLs. If a document references an
external schema, the diagnostic explains how to *import* it locally
instead. The "explain how to import" UI text is part of Phase 1.

`dataCollection: 'none'`, `requiresAccount: false`,
`requiresInternetForCoreFeatures: false`, `offlineSupported: true`.

### 9. Entitlements

Free:

- Parse / format / minify / validate
- Tree / table / text views
- JSON Pointer path inspector
- Search across keys and values
- Copy path / copy value
- Basic schema inference (types, required-ness)
- Basic textual diff
- JSON, Markdown summary, plaintext path exports
- Save / load local workspace

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

## Draft `ToolManifest`

Illustrative. Not yet registered. The final shape is finalized in the
implementation PR, not this charter PR.

```ts
import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

export const jsonManifestDraft: ToolManifest = {
  version: 1,
  id: 'json',
  name: 'NekoJSON',
  toolVersion: 1,
  summary:
    'Inspect, validate, navigate, diff, and export local JSON documents. Phase 1 proof tool.',
  artifactKinds: ['json.document', 'json.path-result', 'json.schema', 'json.diff'],
  parsers: ['json.text', 'json.pointer'],
  exporters: [
    'json.export.json.pretty',
    'json.export.json.minified',
    'json.export.markdown.summary',
    'json.export.plaintext.paths',
    'json.export.schema.json-schema',
    'json.export.types.typescript',
    'json.export.types.zod',
    'json.export.docs.data-dictionary',
  ],
  graphProjectors: ['json.graph.references'],
  offlinePolicy: DEFAULT_OFFLINE_POLICY,
  capabilities: {
    canSaveWorkspace: true,
    canExport: true,
    canDiff: true,
    canProjectGraph: true,
  },
  entitlements: {
    free: [
      'parse',
      'format',
      'minify',
      'validate',
      'view.tree',
      'view.table',
      'view.text',
      'inspect.pointer',
      'search',
      'copy.path',
      'copy.value',
      'schema.infer.basic',
      'diff.textual',
      'export.json.pretty',
      'export.json.minified',
      'export.markdown.summary',
      'export.plaintext.paths',
      'export.schema.basic',
      'workspace.save',
    ],
    pro: [
      'view.graph',
      'diff.semantic',
      'migration.studio',
      'batch.transform',
      'schema.infer.advanced',
      'export.types.typescript',
      'export.types.zod',
      'export.docs.data-dictionary',
      'references.broken',
      'references.duplicate',
    ],
  },
  outOfScope: [
    'fetching $ref URLs or any remote schemas',
    'executing JSON-Logic / JSONata / JMESPath or any other programmable query language',
    'acting as a remote schema registry',
    'streaming gigantic JSON beyond the local size threshold',
  ],
};
```

## What's deliberately undecided in Phase 1

These are noted up front so reviewers do not block the charter on
implementation details:

- Tokenizer choice (hand-written vs library, in-tree vs dependency).
- Soft-size threshold value (likely ~10–50 MB; benchmarked during
  implementation).
- Whether `json.graph.references` ships as a stub in Phase 1 or only
  declares its existence in the manifest.
- The exact set of error recovery rules for non-strict parsing
  (trailing commas, comments, unquoted keys). The default mode is
  strict; non-strict toggles are scoped per-document.

## Acceptance for the Phase 1 *implementation* PR (preview)

Tracked here so the implementation PR has a checklist to point at, not
to gate this charter PR:

- [ ] `@nekotools/lens-json` package exists, registered via
      `ToolRegistry`.
- [ ] Manifest passes `validateManifest`.
- [ ] All declared parsers and exporters exist and pass tests.
- [ ] Conformance test parallel to `lens-binary` covers parser →
      diagnostic → export → workspace round-trip.
- [ ] Offline guard sees no new violations.
- [ ] Charter doc updated from "PROPOSED" to "IMPLEMENTED" and linked
      from `docs/roadmap.md`.
