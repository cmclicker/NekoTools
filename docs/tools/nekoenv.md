# NekoEnv — Phase 2.0 charter

> Status: **PROPOSED.** This PR is charter-only. No implementation
> code under `packages/lens-env/*` and no manifest registration ship
> in this PR. Implementation is blocked until this charter is approved
> and merged.

NekoEnv is the Phase 2.0 reuse-gate tool. The point of Phase 2 is to
prove that the platform spine generalizes from the Phase 1 proof tool
(NekoJSON) to a structurally **different** artifact kind. NekoJSON is
tree-shaped JSON; NekoEnv is line-oriented dotenv. If the spine only
fits JSON, it isn't a platform — it's a JSON tool. NekoEnv exists to
falsify that.

## What NekoEnv is

A local, offline workbench for `.env` files. The user pastes, drops,
or opens one or more dotenv documents (`.env`, `.env.local`,
`.env.production`, `.env.example`, etc.). NekoEnv parses them,
validates them, lets the user navigate keys, diff between files, and
export normalized variants. No network. No secret-store integration.
No account. No sync.

## What NekoEnv is *not*

- A secret store. NekoEnv inspects what is in the file you opened; it
  does not fetch from Vault, AWS SSM, Doppler, 1Password, GitHub
  secrets, or any other remote source.
- A runtime. NekoEnv does **not** perform variable interpolation
  (`$VAR`, `${VAR}`, `$(cmd)`). Variable expansion is a *runtime*
  feature of dotenv loaders; a workbench's job is to surface the raw
  text and call out interpolation-shaped tokens, not execute them.
- An encryptor. `sops`, `git-crypt`, `dotenvx` envelope encryption —
  all out of scope. NekoEnv works on plaintext dotenv input.
- A schema registry. Like NekoJSON, NekoEnv works on local
  documents. A user who wants a sharable contract exports an
  `env.example` skeleton or a JSON Schema and saves it themselves.

## The 10 charter questions

### 1. Artifact kind

NekoEnv introduces:

| Kind                | Value                                                                         | Status         |
| ------------------- | ----------------------------------------------------------------------------- | -------------- |
| `env.document`      | An ordered, parsed dotenv document: header comments, entries (`key`, `value`, value-quoting style, trailing comment, source span), blank lines. | Phase 2.1, free. |
| `env.key-result`    | The single resolved entry (or absence) at a user-supplied key.                | Phase 2.1, free. |
| `env.diff`          | A textual diff between two `env.document` artifacts (free). A key-level structural diff (added / removed / changed / reordered keys) is Pro and depends on the Phase 3 semantic-diff engine. | Textual diff: Phase 2.1, free. Structural diff: Pro. |
| `env.schema`        | An inferred schema: which keys are present in which document, basic value-shape detection (boolean / integer / decimal / url / quoted-string / unknown). Advanced inference (enum collapse, format detection, sample expansion) is Pro. | Basic inference: Phase 2.1, free. Advanced inference: Pro. |

Every kind is namespaced under `env.*`. None of them have any meaning
outside NekoEnv. **No artifact kind is reused from `json.*` — even
where the shape looks superficially similar (`env.diff` vs
`json.diff`), the artifact body is dotenv-specific.**

### 2. Parser contract

Reuses `@nekotools/contracts`'s `Parser<TArtifact>`. New parsers:

- `env.text` — accepts raw dotenv text, produces `env.document`.
  Strict mode: `KEY=VALUE` per line, `#` for line comments, `"..."`
  and `'...'` for quoted values, blank lines preserved, trailing
  whitespace policy documented in implementation. Multi-line values
  only inside quoted strings — bare `\n` is a line break, not a
  continuation. The parser emits structured diagnostics on malformed
  lines instead of throwing.
- `env.key` — accepts a key name (e.g. `DATABASE_URL`) against a
  loaded `env.document`, produces `env.key-result`. This is a parser,
  not a runtime, because it converts user input (the key) into a
  structured artifact (the entry, or a deliberate "key absent"
  marker). Parallel to `json.pointer` from NekoJSON.

Non-strict behaviors that are **out of scope** for Phase 2:

- Variable expansion (`$VAR`, `${VAR}`, `$(...)`).
- Cross-file inheritance (`.env.local` overrides `.env`). The user
  loads each file as its own `env.document`; comparison happens
  through `env.diff`, not through implicit merging.
- `export KEY=VALUE` shell prefix syntax — common in `.envrc`
  variants. Diagnosed (`env.shell_export_prefix`), not silently
  accepted.

No `env.url` parser. NekoEnv never fetches.

### 3. Diagnostic contract

Reuses the existing `Diagnostic` shape from `@nekotools/contracts`.
Codes shipping in the Phase 2.1 engine MVP:

| Code                              | Severity | Meaning |
| --------------------------------- | -------- | ------- |
| `env.syntax_error`                | error    | A non-blank, non-comment line is not parseable as `KEY=VALUE`. |
| `env.empty_input`                 | error    | Input is whitespace and/or comments only. (Mirror of `json.empty_input`.) |
| `env.invalid_key`                 | error    | Key does not match `[A-Za-z_][A-Za-z0-9_]*` (the shell-portable subset). Surfaces with the exact offending span. |
| `env.duplicate_key`               | warning  | Same key appears more than once. Most dotenv loaders keep the last occurrence; the warning points at every occurrence after the first and references the first occurrence's line/column. (Mirror of `json.duplicate_key`.) |
| `env.unterminated_quote`          | error    | `KEY="..` or `KEY='..` reaches EOF without a matching closing quote. |
| `env.shell_export_prefix`         | warning  | Line begins with `export `. Diagnosed because most dotenv loaders silently ignore it and the user's intent is then ambiguous. |
| `env.interpolation_token`         | info     | Value contains `$VAR`, `${VAR}`, or `$(...)`. Informational — NekoEnv does not expand it; the diagnostic tells the user this token will be evaluated by their loader at runtime. |
| `env.key.not_found`               | error    | `env.key` parser was given a key that is not in the document. Returned via the diagnostic channel, not as a thrown error. |
| `env.large_document`              | info     | Input exceeds the soft size threshold. Parallel to `json.large_document`. Reuses the threshold-config knob pattern from `lens-json`. |
| `env.diff.missing_input`          | error    | Textual diff invoked without both document hints. (Mirror of `json.diff.missing_input`.) |

Codes deliberately **not** in Phase 2.1 (charter-approved future work,
must each land in a follow-up PR that updates this table):

- `env.value_looks_secret` (info) — values matching well-known
  secret-vendor patterns (AWS keys, GitHub PATs, Stripe keys, etc.).
  **Pro**; pattern catalog ships with the paid build.
- `env.url_unreachable` — explicitly never. NekoEnv does not perform
  network reachability checks.

All malformed inputs produce structured diagnostics. The parsers do
not throw; missing-key / not-found surface as diagnostics tied to a
deliberate empty artifact.

### 4. Export contract

Reuses the `Exporter<TArtifact>` interface from
`@nekotools/contracts`. Targets for the Phase 2.1 MVP:

| Exporter id                          | Target      | Audience | Free / Pro |
| ------------------------------------ | ----------- | -------- | ---------- |
| `env.export.env.canonical`           | plaintext   | Re-emit with a canonical normalization: stable key ordering option, value-quoting policy (always-double-quote unless purely safe), preserved comments. Default behavior preserves source order; sorted output is an exporter option. | Free |
| `env.export.env.example`             | plaintext   | `.env.example` skeleton: keys preserved, values redacted to placeholder tokens (e.g. `KEY=<set me>` or `KEY=""`). Preserves comments so they document each key. | Free |
| `env.export.markdown.summary`        | markdown    | Table of keys with comment annotations, quoting style, and value presence. (Parallel to `json.export.markdown.summary`.) | Free |
| `env.export.plaintext.keys`          | plaintext   | One key per line, sorted. Useful for grep / diff workflows. | Free |
| `env.export.schema.json-schema`      | json        | Inferred JSON Schema with `type: object`, `required: [keys present in this document]`, basic value-shape detection. (Parallel to NekoJSON's basic schema inference.) | Free |
| `env.export.diff.textual`            | plaintext   | Unified-diff plaintext of an `env.diff` artifact. (Parallel to `json.export.diff.textual`.) | Free |
| `env.export.types.typescript`        | plaintext   | Typed `ProcessEnv`-shaped interface. | Pro |
| `env.export.types.zod`               | plaintext   | Zod schema validating a loaded env. | Pro |
| `env.export.docs.data-dictionary`    | markdown    | Cross-document data dictionary: which keys appear in which environments, with comment-derived descriptions. | Pro |
| `env.export.compose.dotenv-stack`    | plaintext   | Multi-environment composite for Docker Compose / Kubernetes ConfigMap workflows. | Pro |

All exports run locally. None of them ship the data anywhere.

### 5. Graph / table / matrix primitive

**Phase 2.1 engine ships none of these.** The MVP does not register
any `GraphProjector`.

- **Table primitive** is the *natural* view for dotenv documents:
  `(key, value, quoting, comment)` rows. UI work — lands in the Phase
  2.2 UI PR. No new contract required; the existing `apps/web-suite`
  shell already hosts a table view from NekoJSON's Phase 1.1g.
- **Text view** mirrors NekoJSON's text view: raw source with
  diagnostic-anchored gutters. Phase 2.2 UI.
- **Diff view** is the third UI mode: side-by-side or unified view of
  an `env.diff`. Phase 2.2 UI.
- **Graph** (Pro): `env.graph.references` projector linking the same
  key across multiple loaded documents — "where is `DATABASE_URL`
  defined? where is it `unset`?" Depends on the Phase 3 graph engine.
  Declared in the manifest as honest advertising; not registered in
  the free build, exactly mirroring NekoJSON's `json.graph.references`
  pattern.

Current-build truth: `capabilities.canProjectGraph = false` in the
Phase 2.1 manifest. It flips to `true` only when a Pro build's
registration includes the projector.

### 6. Workspace

**Reuses the existing Phase 0 `Workspace` shape and the
`jsonWorkspaceSerializer` exported from `@nekotools/tool-runtime`.
Phase 2 introduces no new workspace contract.** A NekoEnv workspace
is just a `Workspace` whose artifacts have kind `env.*`. The same
round-trip test pattern from `lens-json`'s `conformance.test.ts` will
prove lossless round-trip for `env.document` artifacts.

**Phase 2.1 (engine) workspace contents**

| Field                   | What ships |
| ----------------------- | ---------- |
| `artifacts`             | Loaded `env.document` artifact(s). The MVP conformance test loads at least two documents to prove the multi-document workspace assumption (parallels NekoJSON's Phase 1.0 → 1.1a multi-document story). |
| `diagnostics`           | Diagnostics produced during the session. |
| `uiState` (passthrough) | The workspace serializer accepts any `uiState` object and round-trips it. The engine MVP test passes `{ activeKey, viewMode }` to prove passthrough; engine MVP does not yet consume those fields. |

**Phase 2.2 (UI) `uiState` fields** consumed in the UI follow-up PR:

- `uiState.activeKey` — last selected dotenv key.
- `uiState.viewMode` — `table | text | diff`.
- `uiState.searchQuery` — the most recent search.
- `uiState.maskedValues` — boolean toggle: render values as `••••••`
  in the UI. Pure rendering preference, not stored masking of the
  underlying artifact.

A NekoEnv workspace is portable: it round-trips losslessly today and
continues to do so as fields are added, per the workspace contract
versioning rule in
[`contract-versioning.md`](../contract-versioning.md).

### 7. Reuse

NekoEnv reuses, in priority order:

| Existing package          | Reused for                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `@nekotools/contracts`    | Every contract. NekoEnv introduces **no new contract types** — only new artifact-kind strings, new parser ids, new diagnostic codes, and new exporter ids. |
| `@nekotools/schemas`      | Workspace + artifact + manifest schema validation. The artifact-kind validator already accepts any `env.*` string; no schema change required for Phase 2.1. |
| `@nekotools/tool-runtime` | Registry, parser runner, export runner, workspace serializer, entitlement gate. NekoEnv registers exactly like NekoJSON does. |
| `@nekotools/lens-json`    | The `clock` + id-factory utility pattern and the `buildRegistration(clock, options)` factory pattern. The pattern is copied (not exported) for the first reuse — if NekoLogs / NekoCron / NekoIgnore each duplicate it again, the third occurrence triggers extraction into a shared helper, per the existing "duplicated more than twice" rule in NekoJSON's charter Section 7. **Phase 2 will not pre-extract the helper**; that would be speculative refactoring. |

NekoEnv does **not**:

- Invent a new artifact root.
- Bypass the workspace serializer.
- Implement its own offline-policy.
- Re-create a parser or exporter registry.
- Reuse NekoJSON's `tokenizer.ts` directly. Dotenv is line-oriented;
  a small dotenv-specific line scanner is the right abstraction. If
  span-precise sub-line spans become a Phase 2.x follow-up
  (e.g. for `env.interpolation_token`), it ships with its own
  minimal scanner — not as a generalized "tokenizer-2.0."

**This is the reuse gate's hard test.** If the answers above had
required a new contract type, a new workspace shape, or a new runtime
mechanism, the spine would have failed the generalization claim, and
NekoEnv would not be a Phase 2 tool — it would be a Phase 3+ tool
that motivates a contract change first. The charter passes the gate
because none of those new types are needed.

### 8. Offline policy

`networkPolicy: 'network-forbidden'`.

NekoEnv does not fetch anything — no remote secret stores, no
schema URLs, no reachability checks for values that look like URLs.
A `env.value_looks_url` info diagnostic (deferred to a future PR) is
explicitly the "we noticed this string looks like a URL" kind of
diagnostic, not the "we tried to reach it" kind.

`dataCollection: 'none'`, `requiresAccount: false`,
`requiresInternetForCoreFeatures: false`, `offlineSupported: true`.

### 9. Entitlements

The exact free / Pro split below will land in
`manifest.entitlements.free` / `.pro` when Phase 2.1 ships. Every
free entry must have a working implementation in the Phase 2.1
implementation PR, per the open-core governance rule (free
entitlements must be implementation-backed). Pro entries are honest
advertising for the future `@nekotools-pro/*` package.

**Free (Phase 2.1 engine MVP):**

- `parse` — `env.text` parser.
- `validate` — diagnostics from Section 3.
- `format` — `env.export.env.canonical` re-emit.
- `inspect.key` — `env.key` parser.
- `schema.infer.basic` — basic value-shape detection + required-keys.
- `diff.textual` — `env.diff` artifact + `env.export.diff.textual`.
- Exports: `env.export.env.canonical`, `env.export.env.example`,
  `env.export.markdown.summary`, `env.export.plaintext.keys`,
  `env.export.schema.json-schema`, `env.export.diff.textual`.
- `workspace.save` — workspace round-trip via the shared serializer.

**Free (Phase 2.2 UI):**

- `view.table` — already a shipped shell capability; NekoEnv wires
  its own column model.
- `view.text` — already a shipped shell capability.
- `view.diff` — *new* shell capability if it doesn't already exist;
  Phase 2.2 will decide whether to extend the existing shell or
  introduce a third view mode in `apps/web-suite`. The decision is
  explicitly an implementation-time call, not a charter pre-commit.
- `search` — already a shipped shell capability.
- `copy.key` — local clipboard, the active key string.
- `copy.value` — local clipboard, the active key's value.
- `mask.value` — UI-only toggle: render values as `••••••` in the
  view. Reversible; never modifies the artifact.

**Pro (advertising — implementation in future private package):**

- `schema.infer.advanced` — enum collapse, format detection,
  cross-document sample unification.
- `secrets.scan` — `env.value_looks_secret` diagnostic powered by a
  vendor-pattern catalog.
- `diff.structural` — semantic / key-level diff. Depends on Phase 3
  semantic-diff engine.
- `graph.references` — `env.graph.references` projector.
- `export.types.typescript` — typed `ProcessEnv` interface.
- `export.types.zod` — Zod env validator.
- `export.docs.data-dictionary` — cross-document data dictionary.
- `export.compose.dotenv-stack` — multi-environment composite.
- `multi-env.compare` — three-or-more-document compare. Depends on
  the Phase 3 multi-doc UI primitive.

Free is genuinely useful on its own. A developer can parse, validate,
diff, format, and export `.env.example` skeletons of every common
dotenv document with the free build alone.

### 10. Out of scope

- Fetching from remote secret stores (Vault, AWS SSM / Secrets
  Manager, Doppler, 1Password Connect, GitHub / GitLab secrets, etc.).
- Variable interpolation / expansion of any kind.
- Encryption or decryption (`sops`, `git-crypt`, `dotenvx` envelope
  encryption).
- Executing scripts with `--env-file` or any other process spawning.
- Acting as a remote schema or secret registry.
- Streaming gigantic dotenv documents beyond the soft threshold
  (`env.large_document` is informational; very large files are an
  unusual dotenv shape and the Pro views may gate above it).

## Draft `ToolManifest` (illustrative)

The TS object will land in the Phase 2.1 implementation PR — under
`packages/lens-env/src/manifest.ts` — and will be schema-validated by
`validateManifest`. The shape below is illustrative for the auditor.
The strings here are the source of truth for the Phase 2.1
implementation's free/Pro identifier set.

```ts
// packages/lens-env/src/manifest.ts (preview only, not committed here)
export const envManifest: ToolManifest = {
  version: 1,
  id: 'env',
  name: 'NekoEnv',
  toolVersion: 1,
  summary:
    'Inspect, validate, diff, and export local dotenv files. Phase 2 reuse-gate tool.',
  artifactKinds: ['env.document', 'env.key-result', 'env.diff', 'env.schema'],
  parsers: ['env.text', 'env.key', 'env.diff.textual'],
  exporters: [
    'env.export.env.canonical',
    'env.export.env.example',
    'env.export.markdown.summary',
    'env.export.plaintext.keys',
    'env.export.schema.json-schema',
    'env.export.diff.textual',
    'env.export.types.typescript',     // Pro intent
    'env.export.types.zod',            // Pro intent
    'env.export.docs.data-dictionary', // Pro intent
    'env.export.compose.dotenv-stack', // Pro intent
  ],
  graphProjectors: ['env.graph.references'], // Pro intent
  offlinePolicy: DEFAULT_OFFLINE_POLICY,
  capabilities: {
    canSaveWorkspace: true,
    canExport: true,
    canDiff: true,
    canProjectGraph: false,
  },
  entitlements: {
    free: [
      'parse',
      'format',
      'validate',
      'inspect.key',
      'schema.infer.basic',
      'diff.textual',
      'export.env.canonical',
      'export.env.example',
      'export.markdown.summary',
      'export.plaintext.keys',
      'export.schema.basic',
      'export.diff.textual',
      'workspace.save',
      // Phase 2.2 UI free entitlements add view.table, view.text,
      // view.diff, search, copy.key, copy.value, mask.value — they
      // land in the Phase 2.2 implementation PR, not 2.1.
    ],
    pro: [
      'schema.infer.advanced',
      'secrets.scan',
      'diff.structural',
      'graph.references',
      'export.types.typescript',
      'export.types.zod',
      'export.docs.data-dictionary',
      'export.compose.dotenv-stack',
      'multi-env.compare',
    ],
  },
  outOfScope: [
    'fetching from remote secret stores',
    'variable interpolation or expansion of any kind',
    'encryption or decryption of dotenv files',
    'executing scripts with --env-file',
    'acting as a remote schema or secret registry',
    'streaming gigantic dotenv documents beyond the local soft threshold',
  ],
};
```

## What this PR does *not* include

- Any code under `packages/lens-env/`. The package directory does
  not exist yet; it lands in Phase 2.1.
- Any change to contracts, schemas, runtime, offline guard, or
  NekoJSON.
- Any change to `apps/web-suite`.
- Any change to CI workflows.
- A merged manifest registration.

## Acceptance for the Phase 2.1 implementation PR

(Preview — these gates apply to the implementation PR, not to this
charter PR.)

- [ ] `@nekotools/lens-env` package exists, registered via a
      `buildEnvRegistration(clock, options?)` factory + the existing
      `ToolRegistry`.
- [ ] Manifest passes `validateManifest`.
- [ ] Free-tier parsers and exporters exist and pass tests
      (`env.text`, `env.key`, plus every free exporter from Section
      4).
- [ ] Conformance test parallel to `lens-binary` / `lens-json`
      covers parser → diagnostic → export → workspace round-trip,
      including the multi-document case.
- [ ] Monetization-safety tests parallel to NekoJSON's: free
      entitlements match the exact MVP-backed set, deferred free
      features are absent, Pro exporters are declared but not
      registered, `env.graph.references` is declared but not
      registered, and `runExporter` rejects every Pro exporter id.
- [ ] Offline guard sees no new violations.
- [ ] This charter doc updated from "PROPOSED" to "IMPLEMENTED" in
      the same PR.

## Deferred to follow-up PRs (preview, not gating this charter)

| Item                                                | Target phase | Notes |
| --------------------------------------------------- | ------------ | ----- |
| UI: table / text / diff views + search + copy + mask | Phase 2.2   | Wires into `apps/web-suite`. Decides whether `view.diff` reuses an existing shell mechanism or introduces a third view mode. |
| `env.value_looks_secret` Pro diagnostic              | Pro (future)| Vendor-pattern catalog in the private package. |
| `env.graph.references` Pro projector                 | Pro (future)| Depends on the Phase 3 graph engine. |
| Multi-env compare (3+ documents)                     | Pro (future)| Depends on the Phase 3 multi-doc UI primitive. |

## Why this is the right Phase 2 tool

The roadmap's [Phase 2](../roadmap.md#phase-2--fast-adjacent-tools)
candidates are NekoEnv, NekoLogs, NekoCron, NekoIgnore, NekoPackage.
NekoEnv is the right *first* Phase 2 tool because:

1. **It exercises the spine differently from NekoJSON.** Line-oriented
   text + simple per-line shape, not a recursive value tree. If the
   contracts only fit JSON, this is where it fails.
2. **It needs every part of the spine.** Parser, multi-document
   workspace, diagnostics with spans, exporters, diff, schema
   inference — same surface NekoJSON uses, exercised on a new
   substrate.
3. **It has a small, well-understood domain.** Dotenv is essentially
   a stable folk standard; reviewers can judge correctness without
   needing deep domain expertise.
4. **Reuse is high.** Every contract is reused. No new contract type.
   No new workspace shape. No new runtime mechanism. The reuse gate
   passes cleanly.
5. **It is genuinely useful.** Most developers have several `.env*`
   files per project; a workbench that diffs, normalizes, and emits
   `.env.example` skeletons offline has immediate utility.
