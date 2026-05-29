# The NekoTools tool standard

> This is the **gold standard** every NekoTools tool follows. It codifies the
> shape of a finished tool — engine, monetization, UI, tests, docs — so the
> Nth tool is days of work, not months, and so quality does not drift across
> the suite.
>
> **Reference implementation: NekoSecrets** (`@nekotools/lens-secrets` +
> the web-suite tab). When this document says "like NekoSecrets," read its
> charter ([tools/nekosecrets.md](tools/nekosecrets.md)) and source.

This document complements, and does not replace,
[product-doctrine.md](product-doctrine.md) (the rules that cannot be bent),
[tool-charter.md](tool-charter.md) (the 10-question reuse gate), and
[monetization-model.md](monetization-model.md). Where they conflict, the
doctrine wins.

## 0. The non-negotiables (from the doctrine)

1. **Local-only.** No feature requires the network for its primary function.
2. **Zero telemetry / analytics / remote config / hidden fetches.**
3. **No mandatory account; no degradation offline.**
4. **Pro code** ships in the single binary but is **gated**, never silently
   functional for free users. (Future heavy Pro lives in a private
   `@nekotools-pro/*` package.)

`pnpm offline-guard` enforces #1–#2 in CI. A tool that cannot pass it does not
ship.

## 1. Engine package layout (`packages/lens-<tool>/`)

Every engine is a workspace package with this shape (NekoSecrets is the model):

```
src/
  kinds.ts          # artifact-kind strings + the artifact value types
  diagnostics.ts    # diagnostic codes + makeDiagnostic (exactOptionalPropertyTypes-safe)
  parser-text.ts    # the sync Parser: never throws; emits diagnostics + a best-effort artifact
  rules.ts          # (if pattern-based) the rule catalog + a *_BY_ID lookup
  exporters.ts      # freeExporters + proExporters
  manifest.ts       # the ToolManifest (source of truth for entitlements)
  index.ts          # build<Tool>Registration(clock, options?): ToolRegistration
  __tests__/        # conformance + edge-cases (+ rules, if applicable)
README.md           # engine reference (what it does, usage, surface, tests)
```

Rules:

- **Reuse every contract** from `@nekotools/contracts`; introduce **no new
  contract types** — only new `<tool>.*` artifact-kind strings, a parser id,
  diagnostic codes, and exporter ids.
- Reuse `@nekotools/lens-kit` for the clock + id-factory (do not re-implement).
- The parser is **whole-snapshot and never throws.** Malformed, empty, huge,
  or adversarial input yields structured diagnostics plus a best-effort
  artifact — not an exception.
- Async work (e.g. Web Crypto) follows the **async-core pattern**: register a
  sync ingest parser and run the async op as an injectable engine function, so
  the synchronous `Parser` contract holds.

## 2. Sensitive-artifact safety (when the artifact can hold secrets)

NekoSecrets sets the bar: **the raw secret never enters the artifact.** Store
masked previews + locations only. The consequence is that the artifact, every
export, and the saved workspace are all safe to persist and share. Tools that
handle credentials, tokens, or PII follow this — and prove it with a
**no-leak invariant test** (§5) that scans every export for the raw value.

## 3. Monetization (single-build, entitlement-gated)

The model is **one build, gated at runtime** — not two apps.

- `manifest.entitlements.free` lists exactly what this build ships. Every entry
  is implementation-backed in the same change that adds it.
- `manifest.entitlements.pro` advertises Pro. Some Pro features are
  **implemented and gated in this binary** (e.g. NekoSecrets' SARIF / redacted
  / HTML / baseline exporters); others are advertised for the future private
  package.
- Pro exporters are returned from `build<Tool>Registration` as `proExporters`.
  `runExporter(registry, tool, id, input, entitlement)` enforces the gate: a
  free caller gets an `EntitlementError`; a Pro entitlement
  (`grantsFeature`, i.e. `features` includes `'*'` or the id) unlocks it.
- Unlock is an **offline signed license** (Ed25519, verified locally against an
  embedded public key — `@nekotools/tool-runtime/license`). The vendor keygen
  CLI (`packages/tool-runtime/scripts/keygen.ts`) mints the signing identity;
  the private key never enters the repo. Losing the local key never voids the
  purchase (re-fetchable). The signed `licensee` is surfaced as "Licensed
  to …" — gentle friction against key sharing.
- The web suite shares one entitlement across every tool via
  `LicenseProvider` / `useLicenseContext`; the header `LicenseBadge` is the
  single unlock surface. A tool consumes the shared entitlement as its default
  and may also accept an explicit `entitlement` prop (tests/embeds).

Free must be **genuinely useful on its own.** Pro is for power/scale/CI, not
for holding the core feature hostage.

## 4. UI conventions (`apps/web-suite`)

A tool tab is registered in `tools.ts` (one entry) and mounts a panel in
`App.tsx` (all panels stay mounted, `hidden`-toggled, so state survives tab
switches). The panel follows NekoSecrets:

- **Input: paste OR local file.** A textarea plus a `FileReader`-based local
  file load (read locally, never uploaded). This satisfies the doctrine's
  "pasted text or local file input" rule.
- **View modes** via a `viewmode` fieldset; the shared `ProSurface` renders the
  free/Pro boundary from the manifest; Pro views show a **locked panel** when
  free and the real output when entitled.
- **Copy affordances** via the shared `clipboard.ts` (API → execCommand
  fallback), with a status line.
- **Standardized CSS classes** (`card`, `paste`, `results`, `viewmode`,
  `copy__btn`, `empty-state`, `toml-stats`, …). New, reusable patterns get a
  shared class, not a one-off.
- **Accessibility:** never colour-alone — pair colour with a text badge/label;
  label every control; use `fieldset`/`legend`, `role="status"`, `aria-label`.
- **Responsive** across mobile → ultrawide: toolbars/stats/options wrap; wide
  tables scroll horizontally; dark-mode variants for every colour.
- **Optional, opt-in audio** is allowed but must be locally synthesized (Web
  Audio, no asset, no network), **default off**, and injectable for tests.

Every meaningful element carries a stable `data-testid` in the **tool's own
namespace** (e.g. `secrets-*`, and `suite-*` for shell-level controls) to
avoid collisions when all panels are mounted at once.

## 5. Test matrix (what "done" means)

A finished tool has, at minimum:

- **Conformance** — manifest schema + cross-field validation; parser →
  diagnostics → free exporters → workspace round-trip; **monetization
  gating** (free set matches the implemented set exactly; Pro ids declared and
  registered as `proExporters`; `runExporter` rejects every Pro id when free
  and unlocks with a Pro entitlement; unknown ids still throw).
- **Edge cases (full exposure)** — empty/whitespace/huge inputs; encoding
  adversaries (CRLF, BOM, surrogate pairs, NUL/control bytes); boundary
  conditions; determinism; and, for sensitive tools, the **no-leak
  invariant** across *every* export.
- **Rules** (pattern-based tools) — a sample per catalog entry (a
  "no rule is untested" guard), overlap/dedup, and precision cases.
- **UI** — each view mode, copy, empty/clean states, Pro lock + unlock, and
  any tool-specific control (filter, file load, audio, …).

### 5.1 The wedge gate — what stops "done-but-hollow"

A parts checklist (engine ✓, exporters ✓, UI ✓, tests pass ✓) is **not** a
definition of done. Every part can be present and the tool can still miss the
one thing that makes it worth shipping. NekoJWT failed exactly here once:
offline signature verification existed, but its result was a UI-only badge that
never reached the audit or the SARIF — so the tool's headline security signal
was invisible to its headline Pro export. All the parts were green; the wedge
was severed.

To prevent the recurrence, "done" is anchored to the tool's **wedge** — the
specific capability that makes it worth choosing over a generic alternative
(for NekoJWT: *the signature/claims security verdict crosses into a
CI-consumable SARIF*; for NekoSecrets: *the masked-but-actionable findings cross
into SARIF without ever leaking the secret*).

1. **Name the wedge in the charter.** `docs/tools/<tool>.md` states, in one
   sentence, the capability that justifies the tool. If you can't, the tool is a
   reskin of a generic lens and should not get a slice.
2. **Flagship test — prove the wedge end-to-end.** Ship at least one test that
   drives the wedge across *every* seam it must cross — engine → UI → the
   export a buyer pays for — asserting on **stable codes/ids**, not prose. For
   NekoJWT: inject a *failing* verify, then assert the SARIF export contains a
   `jwt.signature_invalid` result at `error` level. A test that stops at the UI
   badge would have passed while the wedge was broken — so it doesn't count.
3. **Islands check — no orphaned capability.** For each Pro/headline feature,
   trace its output to a consumer a user can actually reach. A result that an
   engine computes but no export or view surfaces is an *island*: either wire it
   through or cut it. "It's implemented" is not "it's reachable."
   - An *island* is **implemented but unreachable** (a bug). It is distinct from
     an **advertised-future** Pro id: a `manifest.exporters` / `entitlements.pro`
     entry that is intentionally *not yet implemented* (no `proExporters` entry,
     so `runExporter` throws `unknown exporter`). Advertised-future is allowed by
     §3 and is **not** an island — the engine computes nothing for it. The
     islands check only fires when an engine *does* produce a result that no
     export or view consumes. (Only `lens-jwt` and `lens-secrets` ship an
     implemented Pro wedge today; every other tool's Pro is advertised-future.)

The flagship test and the islands check are **review gates**, not optional
polish. A reviewer (human or AI) signs off on the wedge being provably wired,
not just on the parts existing.

## 6. Verification gate (all four, every change)

```bash
pnpm typecheck      # tsc -b, strict + exactOptionalPropertyTypes
pnpm lint           # eslint
pnpm offline-guard  # no network / telemetry violations
pnpm test           # full workspace suite
```

Green on all four is the definition of "ready." "Tests pass" alone is not.

## 7. Documentation

A finished tool ships:

- `docs/tools/<tool>.md` — the charter (10 questions), marked **IMPLEMENTED**.
- `packages/lens-<tool>/README.md` — engine reference (what, usage, surface,
  tests).
- A rule catalog (`docs/tools/<tool>-rules.md`) when pattern-based.

The **manifest is the single source of truth** for entitlements; docs link to
it rather than duplicating it (duplicated manifests drift).

## 8. The per-tool sequence

1. **Charter** — `docs/tools/<tool>.md` answers the 10 questions **and names
   the wedge** (§5.1); the draft manifest passes the schema.
2. **Engine** — parser + diagnostics + exporters + manifest + conformance &
   edge tests. Flip free entitlements on as they ship.
3. **Monetization** — real gated Pro exporters + gating tests (most tools can
   reuse the NekoSecrets pattern wholesale).
4. **UI + flagship** — the web-suite tab + UI tests; wire the shared license;
   add the **flagship test** that proves the wedge end-to-end and run the
   **islands check** (§5.1).
5. **Docs** — charter → IMPLEMENTED, README, rule catalog.
6. **Verify + sync** — all four gates green; commit; keep `main` in sync.

Skipping the charter or the gate is the failure mode that breaks the
"days, not months" property. Don't skip it.
