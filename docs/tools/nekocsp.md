# NekoCSP — tool charter (IMPLEMENTED)

> Status: **IMPLEMENTED — engine + UI + monetization shipped.** NekoCSP
> follows the NekoTools tool standard ([tool-standard.md](../tool-standard.md));
> NekoSecrets is the reference implementation and NekoJWT is the sibling
> real-gated-Pro wedge. The canonical manifest lives at
> `packages/lens-csp/src/manifest.ts`.

**Tool identity.** NekoCSP — a local Content-Security-Policy parser and posture
auditor.

- **Package:** `@nekotools/lens-csp`.
- **UI:** the NekoCSP tab in `apps/web-suite` (WEB category).

A CSP is a **security-sensitive artifact** — it encodes a site's whole content
trust boundary, and a weak one (an `'unsafe-inline'` script-src, a wildcard
host, a missing `default-src`) is a real XSS/clickjacking exposure. NekoCSP
makes auditing one a local, repeatable, CI-wireable step.

## Problem statement

Developers need to read a CSP's directives, spot weaknesses, and ideally gate
them in CI — without pasting the policy into an online evaluator or running it
against a live page. The reflex tools are online evaluators; the policy (and the
posture it reveals) is exactly what you'd rather not ship to a third party.

## Product thesis

Parse + inspect a CSP locally for free; the Pro tier adds a CI-grade posture
audit and SARIF export so a policy review drops straight into code-scanning. No
account, no telemetry, no network.

## What NekoCSP is / is not

- **Is:** a local CSP parser (directives + sources), a ruleId-keyed posture
  auditor, and a SARIF 2.1.0 reporter.
- **Is not:** a runtime evaluator (it does not decide whether a specific URL
  would be allowed/blocked), a hardened-policy *generator* (advertised, future),
  or a fetcher of `report-uri` / `report-to` endpoints.

## The 10 charter questions

### 1. Artifact kind

One kind under `csp.*`:

| Kind | Value | Status |
| --- | --- | --- |
| `csp.parsed` | A decoded policy: ordered `directives` (name + sources), `directiveCount`, and structured `findings`. | Free. |

### 2. Parser contract

Reuses `Parser<TArtifact>`. One parser, `csp.text`: accepts a raw policy header,
strips an optional `Content-Security-Policy:` prefix, splits directives, runs
the basic security checks, and **never throws** — malformed/empty input yields
structured diagnostics.

### 3. Diagnostic contract

Reuses `Diagnostic`. Codes: `csp.empty_input` (info), `csp.parse_error`
(warning), `csp.unsafe_inline`, `csp.unsafe_eval`, `csp.wildcard`,
`csp.data_uri`, `csp.duplicate` (warning), and `csp.missing_directive` (info).
The Pro audit reuses these codes as SARIF ruleIds and adds audit-only ruleIds
(`csp.insecure_scheme`, `csp.broad_scheme`, `csp.missing_default_src`,
`csp.missing_object_src`, `csp.missing_frame_ancestors`, `csp.missing_base_uri`,
`csp.missing_form_action`, `csp.no_reporting`).

### 4. Export contract

Reuses `Exporter<TArtifact>`. Free exporters render to everyone; Pro exporters
are **registered in this build but gated** by `runExporter` behind a valid
entitlement (single-build-gated model).

| Exporter id | Target | Free / Pro |
| --- | --- | --- |
| `csp.export.json` | json | Free |
| `csp.export.normalized` | plaintext | Free |
| `csp.export.markdown.summary` | markdown | Free |
| `csp.export.report` | markdown (posture audit) | **Pro** |
| `csp.export.sarif` | json (SARIF 2.1.0) | **Pro** |

The hardened-policy generator (`export.hardened`) is advertised in
`entitlements.pro` only — it is **not** a registered exporter in this build.

### 5. Graph / table / matrix primitive

**Directive table + raw projections** are primary (table / JSON / audit /
SARIF). No graph/matrix (`canProjectGraph: false`).

### 6. Workspace

Reuses the Phase 0 `Workspace` + `jsonWorkspaceSerializer`; a NekoCSP workspace
holds `csp.parsed` artifacts. Lossless round-trip (conformance).

### 7. Reuse

`@nekotools/contracts` (no new contract types), `@nekotools/schemas`,
`@nekotools/tool-runtime` (registry, runners, **entitlement gate**),
`@nekotools/lens-kit` (clock + id-factory), and the `apps/web-suite` shell
(paste/results cards, view modes, copy, the suite license badge + Pro lock).

### 8. Offline policy

`networkPolicy: 'network-forbidden'`. No fetch, no live-page evaluation, no
report-endpoint resolution, no telemetry. Parsing and auditing are pure string
analysis in the browser.

### 9. Entitlements

**Free:** parse, directive inspection, basic security findings + diagnostics,
JSON / normalized / markdown-summary exports, copy, workspace save.

**Pro (gated, in-binary):** the posture audit report + SARIF exporters.
**Pro (advertised, future):** hardened-policy suggestion, policy comparison,
violation simulation, nonce audit, workspace snapshots.

### 10. Out of scope

- Generating a hardened policy from an app's observed resources (advertised,
  future Pro).
- Deciding whether a specific URL would be allowed/blocked at runtime.
- CSP Level 3 strict-dynamic / hash-nonce interaction analysis (basic only).
- Fetching `report-uri` / `report-to` endpoints, or any network access.

## Verification

- Engine: `conformance` (manifest, parser, diagnostics, free exporters,
  workspace round-trip, **monetization gating**, and the `auditCsp` posture
  audit).
- UI: free directive table + JSON, the Pro lock when free, the unlocked posture
  audit, and SARIF 2.1.0.
- Suite: typecheck · lint · `offline-guard` · full test suite, all green.
