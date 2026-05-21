# NekoJSON UI — Phase 1.1e charter

> Status: **IMPLEMENTED through Phase 1.1h. Phase 1 free tier is
> closed.** Shell (1.1e) + tree/text views (1.1f) + table view +
> search (1.1g) + copy.path / copy.value (1.1h) all ship. Every
> charter-declared free feature now has a working implementation
> declared in `manifest.entitlements.free`.

## What `apps/web-suite` is

The local, offline web shell that hosts every NekoTools lens. NekoJSON
was the first occupant (Phase 1.1e–1.1h). **NekoEnv joined as the
second tool in Phase 2.2** ([`docs/tools/nekoenv.md`](nekoenv.md));
the shell now routes between them via a top-level tool tab
(`App` → `JsonApp` | `EnvApp`). Subsequent tools (NekoLogs, NekoCron,
etc.) will register themselves into the same shell via the existing
[`ToolRegistry`](../../packages/tool-runtime/src/registry.ts) and add
their own tab.

The shell is a pure consumer of artifacts produced by the lens
packages — it never re-implements parsing, never invents a new
contract, and never bypasses the runtime registry.

## What `apps/web-suite` is *not*

- Not a server. It's a static SPA built by Vite.
- Not a cloud product. Bundles are self-contained; no CDN, no remote
  fonts, no telemetry, no analytics.
- Not the Pro app. Pro modules will be linked into a separate paid
  build (a Tauri-wrapped variant of the same web bundle); this shell
  is the public free build.
- Not the only surface. A CLI consumer is a separate Phase 2+ topic.

## Stack decision (Phase 1.1e)

**Vite + React + TypeScript.**

| Choice | Rationale |
| --- | --- |
| Vite | Fast dev loop, no Babel config, native ESM in dev. Builds static bundles with no runtime server dependency. |
| React | Largest off-the-shelf component pool. JSON-tree, virtualized list, code-editor components all exist as React libraries. Tauri's eventual desktop wrapper consumes the same web bundle unchanged. |
| TypeScript | Already the workspace standard. Reuses `tsconfig.base.json`. |

Explicitly rejected this round: vanilla TS (too much hand-rolling for
tree/table/text views), Solid (smaller ecosystem), Tauri-first (Rust
toolchain dependency not justified until a paid desktop build is
queued).

**No new external dependency categories introduced** beyond
`vite` / `@vitejs/plugin-react` / `react` / `react-dom` and their
DefinitelyTyped packages. The offline-guard denylist is unaffected.

## What ships in Phase 1.1e (this PR)

The **shell only**:

- `apps/web-suite` builds with `pnpm --filter @nekotools/web-suite build`.
- `apps/web-suite` runs with `pnpm --filter @nekotools/web-suite dev`.
- The root page renders a manifest-summary panel that imports
  `jsonManifest` from `@nekotools/lens-json` and displays:
  - tool id, name, version, summary
  - offline policy (`network-forbidden`)
  - free entitlements (the user-actionable feature list)
  - Pro entitlements (declared but not in this build)
  - capability flags (current-build truth)
- One smoke test that asserts the manifest import resolves through the
  Vite workspace alias.

That's it. The point of this PR is to prove the build pipeline works
and to pick the stack publicly; not to ship features.

## What's deliberately *not* in this PR

No view, search, or copy affordance for actual JSON parsing. Those
move the manifest's `entitlements.free` list — and per the open-core
governance rule (PR #2 audit), unimplemented free features must not
be declared. They will be added by the PRs that ship them, not now.

Specifically deferred:

| Feature                | Tracked in   |
| ---------------------- | ------------ |
| Tree view              | **Shipped — Phase 1.1f** ([`TreeView.tsx`](../../apps/web-suite/src/TreeView.tsx)) |
| Text view              | **Shipped — Phase 1.1f** ([`TextView.tsx`](../../apps/web-suite/src/TextView.tsx)) |
| Table view             | **Shipped — Phase 1.1g** ([`TableView.tsx`](../../apps/web-suite/src/TableView.tsx)) |
| Search across keys/values | **Shipped — Phase 1.1g** ([`search.ts`](../../apps/web-suite/src/search.ts)) |
| Copy path / copy value | **Shipped — Phase 1.1h** ([`clipboard.ts`](../../apps/web-suite/src/clipboard.ts) + [`pointer-resolve.ts`](../../apps/web-suite/src/pointer-resolve.ts) + App buttons) |

## Reuse map

The shell is a *consumer*, not a producer. It reuses:

| Package                    | What the shell uses it for                              |
| -------------------------- | ------------------------------------------------------- |
| `@nekotools/contracts`     | Type-checking artifacts / diagnostics returned by runs. |
| `@nekotools/schemas`       | Workspace round-trip on save/load (Phase 1.1f+).         |
| `@nekotools/tool-runtime`  | `ToolRegistry` + `runParser` / `runExporter` to drive `json.text` / `json.pointer` / `json.diff.textual` and the exporters. |
| `@nekotools/lens-json`     | `buildJsonRegistration`, `jsonManifest`. |

No new contracts are introduced by the UI. No new artifact kinds. The
UI's job is to *render* what already exists.

## Workspace persistence (consumed as of Phase 1.1g)

The UI threads `uiState` through React state and accepts it via
`App`'s `initialUiState` prop. All three fields the NekoJSON charter
Section 6 "Intent for Phase 1.1+" declared are now consumed:

| Field                  | Consumed by                                                                                                   | Shipped in |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | ---------- |
| `uiState.viewMode`     | The Tree / Text / Table radio in `App.tsx`.                                                                   | 1.1f (tree, text) + 1.1g (table) |
| `uiState.activePath`   | `TreeView` highlights the matching row; the toolbar shows the JSON Pointer.                                   | 1.1f       |
| `uiState.searchQuery`  | Filters `TreeView` (matches + ancestors, auto-expanded) and `TableView` rows (cell + column-name substring).  | 1.1g       |

The existing `jsonWorkspaceSerializer` (shipped in Phase 0) still
treats `uiState` as opaque and round-trips it losslessly — the
conformance suite pins all three fields with dedicated tests. The UI
does not yet expose a save / load button; that's a follow-up.

## Offline policy

`network-forbidden`. The shell:

- Bundles all fonts (system fallbacks for Phase 1.1e; no Google Fonts).
- Bundles all icons (no remote icon CDN).
- Does not call `fetch()` for anything.
- Does not register a service worker that talks to the network.
- Will be installable as a PWA only when the cache strategy is
  fully local (`Cache.put` of bundled assets — Phase 2+ work).

The offline-guard scanner already enforces this at the file level —
the new `apps/web-suite` package is included in its walk and produces
zero violations on this PR.

## Stack of decisions to be revisited later

- **Virtualization for huge JSON trees** — Phase 1.1f when we
  actually wire a tree component. `react-window` is the front-runner.
- **In-editor diagnostics for text view** — Phase 1.1f. Either
  CodeMirror 6 or a hand-rolled gutter; both are achievable without
  new doctrine implications.
- **Theming** — A formal theming system is out of scope for Phase 1
  and remains Phase 2+. The shell does include minimal
  `prefers-color-scheme` compatibility in `styles.css` so it does not
  blind users on dark-default systems, but there is no user-selectable
  theme, no theme tokens, no design-system layer. That all lands when
  theming is formally chartered.
- **Routing** — None for now. The shell has one page (NekoJSON). When
  a second lens lands, a minimal hand-rolled hash router will
  introduce routes; no react-router until necessary.

## Acceptance criteria for this PR

- [x] `pnpm typecheck` includes `apps/web-suite` via root project
      references.
- [x] `pnpm lint` runs on `apps/web-suite/src/**`.
- [x] `pnpm test` runs the shell smoke test.
- [x] `pnpm --filter @nekotools/web-suite build` produces a Vite
      bundle with no external network references.
- [x] The shell imports `@nekotools/lens-json` through the workspace
      alias (verified in the smoke test).
- [x] `pnpm offline-guard` reports zero violations across the new
      files.
- [x] No new entitlements in `jsonManifest.entitlements.free` — the
      shell does not yet implement any user-actionable feature.

## Phase 1 closeout (Phase 1.1h shipped)

All Phase 1.1h acceptance criteria are met:

- [x] "Copy path" affordance writes the current `uiState.activePath`
      (RFC 6901 JSON Pointer) to the user's clipboard via the local
      Clipboard API — no network, no telemetry, no auth.
- [x] "Copy value" affordance serializes the JSON value at the active
      path and writes it to the clipboard locally.
- [x] `manifest.entitlements.free` gains `copy.path` + `copy.value` in
      the same PR.
- [x] Clipboard path is purely local: `navigator.clipboard.writeText`
      with a permissive in-page fallback (hidden `<textarea>` +
      `document.execCommand('copy')`). No `fetch`, no remote helper,
      no third-party clipboard library.
- [x] No new external runtime dependencies.
- [x] Pure-helper unit tests cover the pointer resolver + clipboard
      both paths. Component-level tests inject `clipboardDeps` and
      exercise both success and failure flows.

**Phase 1 is fully closed.** The next default branch is the Phase 2.0
NekoEnv charter (queue row #10).
