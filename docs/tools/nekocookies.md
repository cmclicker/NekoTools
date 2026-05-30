# NekoCookies — tool charter (IMPLEMENTED)

> Status: **IMPLEMENTED — engine + UI + monetization shipped.** NekoCookies
> follows the NekoTools tool standard ([tool-standard.md](../tool-standard.md));
> NekoSecrets is the reference implementation and NekoJWT / NekoCSP are sibling
> real-gated-Pro wedges. The canonical manifest lives at
> `packages/lens-cookies/src/manifest.ts`.

**Tool identity.** NekoCookies — a local `Set-Cookie` / `Cookie` header parser
and cookie security & privacy auditor.

- **Package:** `@nekotools/lens-cookies`.
- **UI:** the NekoCookies tab in `apps/web-suite` (WEB category).

A cookie is a **security-sensitive artifact** — a `Set-Cookie` line encodes a
session's whole protection posture, and its value is frequently a session token.
A missing `Secure`/`HttpOnly`, a `SameSite=None` mistake, or a `__Host-` prefix
violation is a real session-hijacking / CSRF exposure. NekoCookies makes
auditing one a local, repeatable, CI-wireable step — without leaking the value.

## Problem statement

Developers need to read a `Set-Cookie` header, spot weak attributes, and gate
them in CI — without pasting a header (often carrying a live session token) into
an online analyzer. The reflex tools are online; the cookie value is exactly
what you don't want to ship to someone else's server.

## Product thesis

Parse + inspect cookies locally for free, with values masked by default; the Pro
tier adds a CI-grade security & privacy audit and SARIF export so a cookie
review drops straight into code-scanning. No account, no telemetry, no network.

## What NekoCookies is / is not

- **Is:** a local cookie parser (attributes + prefixes), a ruleId-keyed security
  & privacy auditor, and a value-free SARIF 2.1.0 reporter.
- **Is not:** a cookie jar (it never sets/sends/stores a cookie), a
  public-suffix / eTLD+1 validator over the network, a tracking-cookie
  classifier, or a signed/encrypted-value decryptor.

## The 10 charter questions

### 1. Artifact kind

One kind under `cookie.*`:

| Kind | Value | Status |
| --- | --- | --- |
| `cookie.parsed` | Cookies decoded from a `Set-Cookie` (with attributes) or `Cookie` (name/value) header, plus the parse mode. | Free. |

### 2. Parser contract

Reuses `Parser<TArtifact>`. One parser, `cookie.text`: accepts a header, mode
selected by `hints.mode` (`set-cookie` default / `cookie`), runs the per-cookie
security checks, and **never throws** — malformed segments yield diagnostics.

### 3. Diagnostic contract

Reuses `Diagnostic`. Codes: `cookie.empty_input`, `cookie.parse_error`,
`cookie.insecure`, `cookie.no_httponly`, `cookie.samesite_missing`,
`cookie.samesite_none_insecure`, `cookie.secure_prefix`, `cookie.host_prefix`,
`cookie.expired`, `cookie.duplicate_name`, `cookie.large`. The Pro audit reuses
these as SARIF ruleIds and adds audit-only ruleIds (`cookie.samesite_none`,
`cookie.broad_domain`, `cookie.partitioned_insecure`).

### 4. Export contract

Reuses `Exporter<TArtifact>`. Free exporters render to everyone; Pro exporters
are **registered in this build but gated** by `runExporter` behind a valid
entitlement (single-build-gated model).

| Exporter id | Target | Free / Pro |
| --- | --- | --- |
| `cookie.export.json` | json | Free |
| `cookie.export.normalized` | plaintext | Free |
| `cookie.export.markdown.summary` | markdown (value-free) | Free |
| `cookie.export.audit.report` | markdown (security & privacy audit) | **Pro** |
| `cookie.export.sarif` | json (SARIF 2.1.0) | **Pro** |

The policy-preset generator (`export.policy.preset`) is advertised in
`entitlements.pro` only — it is **not** a registered exporter in this build.

### 5. Graph / table / matrix primitive

**Attribute table + raw projections** are primary (table / JSON / normalized /
markdown / audit / SARIF). No graph/matrix (`canProjectGraph: false`).

### 6. Workspace

Reuses the Phase 0 `Workspace` + `jsonWorkspaceSerializer`; a NekoCookies
workspace holds `cookie.parsed` artifacts. Lossless round-trip (conformance).

### 7. Reuse

`@nekotools/contracts` (no new contract types), `@nekotools/schemas`,
`@nekotools/tool-runtime` (registry, runners, **entitlement gate**),
`@nekotools/lens-kit` (clock + id-factory), and the `apps/web-suite` shell
(paste/results cards, view modes, value masking, copy, the suite license badge
+ Pro lock).

### 8. Offline policy

`networkPolicy: 'network-forbidden'`. No cookie is set/sent/stored, no
public-suffix lookup, no telemetry. Parsing and auditing are pure local
analysis; values are masked in the UI and never appear in the audit output.

### 9. Entitlements

**Free:** parse (both modes), attribute inspection, security diagnostics, JSON /
normalized / value-free-markdown exports, copy, value masking, workspace save.

**Pro (gated, in-binary):** the security & privacy audit report + SARIF
exporters. **Pro (advertised, future):** policy packs, tracking detection,
public-suffix checks, set comparison, policy-preset export, workspace snapshots.

### 10. Out of scope

- Setting, sending, or storing cookies in a real browser jar.
- Public-suffix-list / eTLD+1 validation over the network.
- Tracking-cookie classification or third-party reputation lookups.
- Decrypting or validating signed/encrypted cookie values.
- Network access of any kind during inspection.

## Verification

- Engine: `conformance` (manifest, parser, diagnostics, free exporters,
  workspace round-trip, **monetization gating**, and the `auditCookies` security
  & privacy audit incl. severity elevation + posture rules).
- UI: free attribute table + masking, the Pro lock when free, the unlocked
  security audit, and SARIF 2.1.0.
- Suite: typecheck · lint · `offline-guard` · full test suite, all green.
