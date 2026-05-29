# NekoSecrets — tool charter (IMPLEMENTED)

> Status: **IMPLEMENTED — engine + UI + monetization shipped.** The engine
> (`@nekotools/lens-secrets`), the web-suite tab, and the gated Pro exporters
> are all live. NekoSecrets is the **reference implementation** of the
> NekoTools tool standard — see [tool-standard.md](../tool-standard.md). This
> document is the tool charter ([tool-charter.md](../tool-charter.md)); the
> canonical manifest lives at `packages/lens-secrets/src/manifest.ts` and the
> rule catalog at [nekosecrets-rules.md](nekosecrets-rules.md).

**Tool identity.** NekoSecrets — a local secret/credential scanner.

- **Package:** `@nekotools/lens-secrets`.
- **UI:** the NekoSecrets tab in `apps/web-suite` (SECURITY category).

NekoSecrets is the **strongest single argument for the local-first thesis**:
you paste a file you *suspect* contains credentials, and nothing leaves your
machine. The cleartext only ever lives in your input box; findings store
masked previews + locations only, so the artifact, every export, and the
saved workspace are all safe to share.

## Problem statement

Developers routinely need to check whether a config file, a log dump, a
`.env`, or a snippet of code contains leaked credentials — before committing,
before pasting into a ticket, before sharing. The reflex is to paste it into a
web-based secret scanner, which is exactly the wrong move for the most
sensitive artifact imaginable. NekoSecrets makes the safe path the easy path.

## Product thesis

Scan a sensitive artifact for credentials **entirely locally** — provider
patterns plus entropy heuristics — with zero telemetry, no account, and no
network. Findings are masked. The Pro tier adds CI-grade outputs (SARIF, a
shareable HTML report, a fingerprint baseline) and a redacted copy of the
source, unlocked by a locally-verified signed license key.

## What NekoSecrets is

A local, offline credential scanner. The user pastes text **or loads a local
file**. NekoSecrets matches 30 high-precision detection rules (28
provider-specific + 2 generic) plus a Shannon entropy fallback, reports each
finding with a **masked** preview + line/column + severity, lets the user
filter by severity, and exports the results. No network, no account, no upload.
The full catalog is in [nekosecrets-rules.md](nekosecrets-rules.md).

## What NekoSecrets is *not*

- **Not a validity checker.** It never calls a provider to test whether a
  detected key is live — that would require the network.
- **Not a git-history / filesystem scanner** (in the free tier). It analyzes
  the snapshot you hand it. History scanning is advertised Pro.
- **Not a guarantee of zero false positives.** Entropy hits are heuristic;
  severity and the severity filter help triage.
- **Not a vault or a store.** It does not persist your cleartext.

## The 10 charter questions

### 1. Artifact kind

One kind, namespaced under `secret.*`:

| Kind | Value | Status |
| --- | --- | --- |
| `secret.report` | The result of scanning text: `findingCount`, an array of `findings` (each: `ruleId`, `description`, `severity`, `line`, `column`, `length`, **masked** `preview`, `entropy`), and `redactedText` (the input with every secret span replaced by `[REDACTED:<ruleId>]`). The raw secret is **never** stored. | Free (report); `redactedText` is consumed by a Pro exporter. |

### 2. Parser contract

Reuses `Parser<TArtifact>`. One parser:

- `secret.text` — accepts raw text, produces `secret.report`. Whole-snapshot,
  **never throws** (malformed/odd input yields diagnostics + a best-effort
  report), pure local string analysis. Entropy thresholds are injectable
  (`entropyThreshold`, `entropyMinLength`).

### 3. Diagnostic contract

Reuses `Diagnostic`. Codes:

| Code | Severity | Meaning |
| --- | --- | --- |
| `secret.empty_input` | info | Empty / whitespace-only input. |
| `secret.clean` | info | Scanned; nothing flagged. |
| `secret.finding` | error / warning / info (high / medium / low) | One per finding, carrying the masked preview + location + a rotate-this-credential hint. |

### 4. Export contract

Reuses `Exporter<TArtifact>`. Free exporters ship to everyone; Pro exporters
are **registered in this build but gated** by `runExporter` behind a valid
entitlement (the single-build-gated model — see the standard).

| Exporter id | Target | Free / Pro |
| --- | --- | --- |
| `secret.export.json` | json | Free |
| `secret.export.csv` | csv | Free |
| `secret.export.markdown.summary` | markdown | Free |
| `secret.export.sarif` | json (SARIF 2.1.0) | **Pro** |
| `secret.export.redacted` | plaintext | **Pro** |
| `secret.export.html` | html (self-contained, offline) | **Pro** |
| `secret.export.baseline` | json (deterministic fingerprints) | **Pro** |

All exports carry masked previews only; none ship data anywhere.

### 5. Graph / table / matrix primitive

**Table** is the primary view — the findings table (severity badge, rule,
line:col, masked preview), with a free severity filter. No graph/matrix.

### 6. Workspace

Reuses the Phase 0 `Workspace` shape and `jsonWorkspaceSerializer`. A
NekoSecrets workspace is a `Workspace` whose artifacts are `secret.report`.
Round-trip is masked and lossless (conformance test). UI `uiState`:
`viewMode`, `proUnlocked`, `soundOn`.

### 7. Reuse

Reuses `@nekotools/contracts` (every contract; no new contract types),
`@nekotools/schemas` (artifact/workspace/manifest validation),
`@nekotools/tool-runtime` (registry, runners, **entitlement gate**, the
offline license layer), `@nekotools/lens-kit` (clock + id-factory), and the
`apps/web-suite` shell (paste/results cards, view-mode fieldset, copy
affordances, the suite license badge).

### 8. Offline policy

`networkPolicy: 'network-forbidden'` (`DEFAULT_OFFLINE_POLICY`). No socket,
no fetch, no validity check, no telemetry. File loading uses the browser
`FileReader` — the bytes are read locally and never uploaded. The only crypto
is the **offline** Ed25519 signature check that verifies a license key.

### 9. Entitlements

**Free (shipped):** `scan.patterns`, `scan.entropy`, `inspect.findings`,
`diagnostics.security`, `mask.findings`, `export.json`, `export.csv`,
`export.markdown.summary`, `copy.output`, `workspace.save` — plus the UI
severity filter and local file load.

**Pro (gated, in-binary):** `export.sarif`, `export.redacted`, `export.html`,
`baseline.export` are implemented and gated. **Pro (advertised, future
`@nekotools-pro/*`):** `rules.custom`, `allowlist.manage`, `scan.git-history`,
`baseline.diff`, `entropy.tuning`, `redact.document`, `workspace.snapshots`.

Free is genuinely useful on its own: scan, triage by severity, and export —
entirely offline.

### 10. Out of scope

- Uploading input or findings to any service or remote scanner.
- Validating whether a detected credential is live (no network).
- Git-history / remote-repo / filesystem scanning (free tier).
- Redacting the source document for free (Pro — requires retaining cleartext).
- Guaranteeing zero false positives.

## Verification (the gate this tool passes)

- Engine: `conformance` (manifest, parser, diagnostics, exporters, workspace
  round-trip, **monetization gating**), `rules` (a sample per catalog rule +
  dedup + precision), and `edge-cases` (encoding adversaries, redaction,
  configurable entropy, Pro corners, scale/determinism, and the **no-leak
  invariant** across every export).
- UI: severity stats/filter/no-match, local file load, every view mode, Pro
  locks + unlocks, and the opt-in audio cue.
- Suite: typecheck · lint · `offline-guard` (no violations) · full test suite,
  all green.
