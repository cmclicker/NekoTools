# NekoPackage — tool charter (IMPLEMENTED)

> Status: **IMPLEMENTED — engine + UI + monetization shipped.** NekoPackage
> follows the NekoTools tool standard ([tool-standard.md](../tool-standard.md));
> NekoSecrets is the reference implementation and NekoJWT / NekoCSP are sibling
> real-gated-Pro wedges. The canonical manifest lives at
> `packages/lens-package/src/manifest.ts`.

**Tool identity.** NekoPackage — a local `package.json` inspector and
dependency & license-risk auditor.

- **Package:** `@nekotools/lens-package`.
- **UI:** the NekoPackage tab in `apps/web-suite` (PROJECT category).

A `package.json` is a **supply-chain-sensitive artifact** — it declares every
dependency, lifecycle script, and the license your project ships under. A
copyleft transitive license, a `curl | sh` postinstall, or a `github:` specifier
is a real legal/security exposure. NekoPackage makes auditing one a local,
repeatable, CI-wireable step.

## Problem statement

Developers and reviewers need to assess a `package.json` for license risk and
supply-chain red flags — and gate it in CI — without pasting it into an online
analyzer or running `npm install` (which executes arbitrary lifecycle scripts).
The reflex tools are online or require an install; the manifest (and the posture
it reveals) is exactly what you'd rather audit locally first.

## Product thesis

Inspect a `package.json` locally for free; the Pro tier adds a CI-grade
dependency & license-risk audit and SARIF export so a manifest review drops
straight into code-scanning. No account, no telemetry, no network, no install.

## What NekoPackage is / is not

- **Is:** a local manifest parser (metadata / scripts / dependencies), a
  dependency & license-risk auditor (SPDX license classification + script and
  dependency risk), and a SARIF 2.1.0 reporter.
- **Is not:** a registry client (it never fetches metadata or tarballs), an
  installer / script runner, a full vulnerability scanner (no advisory DB), or a
  lockfile-graph analyzer.

## The 10 charter questions

### 1. Artifact kind

One kind under `package.*`:

| Kind | Value | Status |
| --- | --- | --- |
| `package.manifest` | A decoded `package.json`: metadata, scripts (+ risk flags), dependencies (+ remote/unpinned flags), duplicates, counts. | Free. |

### 2. Parser contract

Reuses `Parser<TArtifact>`. One parser, `package.json`: accepts raw
`package.json`, extracts metadata/scripts/dependencies and per-item risk
signals, and **never throws** — malformed input yields structured diagnostics.

### 3. Diagnostic contract

Reuses `Diagnostic`. Codes include `package.empty_input`, `package.invalid_json`,
`package.not_object`, `package.missing_name` / `package.missing_version`,
`package.invalid_section`, `package.duplicate_dependency`,
`package.{lifecycle,network_shell,destructive}_script`,
`package.{remote,unpinned}_dependency`, `package.large_document`. The Pro audit
reuses these as SARIF ruleIds and adds audit-only license ruleIds
(`package.license_copyleft`, `package.license_missing`,
`package.license_unlicensed`, `package.license_unknown`).

### 4. Export contract

Reuses `Exporter<TArtifact>`. Free exporters render to everyone; Pro exporters
are **registered in this build but gated** by `runExporter` behind a valid
entitlement (single-build-gated model).

| Exporter id | Target | Free / Pro |
| --- | --- | --- |
| `package.export.summary.json` | json | Free |
| `package.export.markdown.summary` | markdown | Free |
| `package.export.policy.report` | markdown (dependency & license-risk audit) | **Pro** |
| `package.export.sarif` | json (SARIF 2.1.0) | **Pro** |

The CI-guard generator (`ci.guard.export`) is advertised in `entitlements.pro`
only — it is **not** a registered exporter in this build.

### 5. Graph / table / matrix primitive

**Metadata + dependency/script tables + raw projections** are primary. No
graph/matrix (`canProjectGraph: false`).

### 6. Workspace

Reuses the Phase 0 `Workspace` + `jsonWorkspaceSerializer`; a NekoPackage
workspace holds `package.manifest` artifacts. Lossless round-trip (conformance).

### 7. Reuse

`@nekotools/contracts` (no new contract types), `@nekotools/schemas`,
`@nekotools/tool-runtime` (registry, runners, **entitlement gate**),
`@nekotools/lens-kit` (clock + id-factory), and the `apps/web-suite` shell
(paste/results cards, tables, copy, the suite license badge + Pro lock).

### 8. Offline policy

`networkPolicy: 'network-forbidden'`. No registry fetch, no install, no script
execution, no telemetry. Parsing and auditing are pure local analysis.

### 9. Entitlements

**Free:** parse, metadata/scripts/dependencies inspection, basic risk
diagnostics, JSON / markdown-summary exports, copy, workspace save.

**Pro (gated, in-binary):** the dependency & license-risk policy report + SARIF
exporters. **Pro (advertised, future):** policy packs, lockfile audit, script
policy, dependency baseline, CI-guard export, workspace snapshots.

### 10. Out of scope

- Fetching registry metadata or package tarballs.
- Installing dependencies or running package scripts.
- Full vulnerability scanning without user-imported local advisory data.
- Lockfile-graph analysis beyond the `package.json` summary.
- Network access of any kind during inspection.

## Verification

- Engine: `conformance` (manifest, parser, diagnostics, free exporters,
  workspace round-trip, **monetization gating**, and the `auditPackage`
  dependency & license-risk audit incl. SPDX license classification).
- UI: free metadata + tables, the Pro lock when free, the unlocked risk report,
  and SARIF 2.1.0.
- Suite: typecheck · lint · `offline-guard` · full test suite, all green.
