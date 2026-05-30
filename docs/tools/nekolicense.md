# NekoLicense — tool charter (IMPLEMENTED)

> Status: **IMPLEMENTED — engine + UI + monetization shipped.** NekoLicense
> follows the NekoTools tool standard ([tool-standard.md](../tool-standard.md));
> NekoSecrets is the reference implementation and NekoJWT / NekoCSP / NekoCookies
> / NekoGitignore are sibling real-gated-Pro wedges. The canonical manifest
> lives at `packages/lens-license/src/manifest.ts`.

> **Not the monetization layer.** NekoLicense is the *tool* that identifies the
> SPDX license of pasted LICENSE text. The suite's paid-unlock license-*key*
> verification is a separate concern (`@nekotools/tool-runtime` +
> `apps/web-suite/src/license-store.tsx`); the two share only a name.

**Tool identity.** NekoLicense — a local LICENSE-file detector and obligations &
risk auditor.

- **Package:** `@nekotools/lens-license`.
- **UI:** the NekoLicense tab in `apps/web-suite` (PROJECT category).

## Problem statement

Developers and reviewers need to know what license a dependency or project is
under, and what obligations it imposes — without pasting it into an online
classifier or reading the full legal text. Copyleft (GPL) and especially
network-copyleft (AGPL) carry real commercial obligations that should be caught
and gated in CI.

## Product thesis

Detect a license locally for free; the Pro tier adds an obligations & risk audit
(copyleft / AGPL / disclose-source) and SARIF export so a LICENSE review drops
straight into CI code-scanning. No account, no telemetry, no network.

## What NekoLicense is / is not

- **Is:** a local heuristic license detector (signature + SPDX tag), an
  obligations & risk auditor, and a SARIF 2.1.0 reporter.
- **Is not:** an exact-text SPDX fingerprinter (a common subset ships), a
  dependency-tree compatibility analyzer (Pro, future), a NOTICE-file generator
  (Pro, future), or legal advice.

## The 10 charter questions

### 1. Artifact kind

One kind under `license.*`:

| Kind | Value | Status |
| --- | --- | --- |
| `license.parsed` | Detected SPDX id + any explicit tag, all signature matches, and the license's category + permissions/conditions/limitations. | Free. |

### 2. Parser contract

Reuses `Parser<TArtifact>`. One parser, `license.text`: identifies the license
via signature matching + an explicit `SPDX-License-Identifier` tag. **Never
throws**; no network.

### 3. Diagnostic contract

Reuses `Diagnostic`. Codes: `license.empty_input` (info), `license.detected`
(info), `license.unknown` (warning), `license.tag_mismatch` (warning). The Pro
audit reuses `license.unknown` / `license.tag_mismatch` as ruleIds and adds
audit-only ruleIds (`license.copyleft`, `license.weak_copyleft`,
`license.network_copyleft`, `license.disclose_source`, `license.same_license`,
`license.state_changes`).

### 4. Export contract

Reuses `Exporter<TArtifact>`. Free exporters render to everyone; Pro exporters
are **registered in this build but gated** by `runExporter` behind a valid
entitlement (single-build-gated model).

| Exporter id | Target | Free / Pro |
| --- | --- | --- |
| `license.export.json` | json | Free |
| `license.export.normalized` | plaintext | Free |
| `license.export.markdown.summary` | markdown | Free |
| `license.export.audit.report` | markdown (obligations & risk) | **Pro** |
| `license.export.sarif` | json (SARIF 2.1.0) | **Pro** |

The compatibility-matrix / NOTICE generators (`export.compatibility`,
`export.notice`) are advertised in `entitlements.pro` only — not registered.

### 5. Graph / table / matrix primitive

**Summary + raw projections** are primary (summary / JSON / markdown / audit /
SARIF). No graph/matrix (`canProjectGraph: false`).

### 6. Workspace

Reuses the Phase 0 `Workspace` + `jsonWorkspaceSerializer`; a NekoLicense
workspace holds `license.parsed` artifacts. Lossless round-trip (conformance).

### 7. Reuse

`@nekotools/contracts` (no new contract types), `@nekotools/schemas`,
`@nekotools/tool-runtime` (registry, runners, **entitlement gate**),
`@nekotools/lens-kit` (clock + id-factory), and the `apps/web-suite` shell
(paste/results cards, view modes, copy, the suite license badge + Pro lock).

### 8. Offline policy

`networkPolicy: 'network-forbidden'`. No network, no telemetry. Detection and
auditing are pure local analysis over pasted text.

### 9. Entitlements

**Free:** detect, term inspection, SPDX-tag reading, detection diagnostics,
JSON / normalized / markdown-summary exports, copy, workspace save.

**Pro (gated, in-binary):** the obligations & risk audit report + SARIF
exporters. **Pro (advertised, future):** compatibility matrix, dependency scan,
NOTICE generation, custom fingerprints, compatibility / notice exports,
workspace snapshots.

### 10. Out of scope

- The full SPDX license list / exact-text fingerprinting (a common subset ships).
- License compatibility analysis across a dependency tree (Pro, future).
- Generating a combined NOTICE / attribution file (Pro, future).
- Legal advice — detection is heuristic and informational only.
- Network access of any kind during inspection.

## Verification

- Engine: `conformance` (manifest, detection, diagnostics, free exporters,
  workspace round-trip, **monetization gating**, and the `auditLicense`
  obligations & risk audit).
- UI: free summary/JSON/markdown, the Pro lock when free, the unlocked
  obligations audit, and SARIF 2.1.0.
- Suite: typecheck · lint · `offline-guard` · full test suite, all green.
