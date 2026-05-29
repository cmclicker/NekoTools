# NekoJWT — tool charter (IMPLEMENTED)

> Status: **IMPLEMENTED — engine + UI + monetization shipped.** NekoJWT
> follows the NekoTools tool standard ([tool-standard.md](../tool-standard.md));
> NekoSecrets is the reference implementation. The canonical manifest lives at
> `packages/lens-jwt/src/manifest.ts`.

**Tool identity.** NekoJWT — a local JWT decoder, auditor, and (Pro) offline
verifier.

- **Package:** `@nekotools/lens-jwt`.
- **UI:** the NekoJWT tab in `apps/web-suite` (WEB category).

A JWT is a **sensitive artifact** — it carries identity and authorization
claims, and developers routinely paste them into random online decoders to
read them. NekoJWT makes the safe path the easy path: decode, inspect, audit,
and even verify the signature **entirely in the browser**, with no network.

## Problem statement

Developers need to read a JWT's claims, spot problems (expired? `alg: none`?
missing `exp`?), and sometimes confirm the signature is valid — without
shipping the token to a third-party site. The reflex tool (jwt.io and clones)
is online; the token is exactly what you don't want to paste into someone
else's server.

## Product thesis

Decode + audit a JWT locally for free; the Pro tier adds a CI-grade claims &
security audit, SARIF export, and **offline signature verification** against a
key you supply. No account, no telemetry, no network.

## What NekoJWT is / is not

- **Is:** a local decoder (header / payload / signature), a claims & security
  auditor, a SARIF reporter, and an offline signature verifier (HS*, RS*, PS*,
  ES*).
- **Is not:** a JWKS *fetcher* (it never resolves a URL — you paste the JWKS),
  a token minter/refresher, or a key manager.

## The 10 charter questions

### 1. Artifact kind

One kind under `jwt.*`:

| Kind | Value | Status |
| --- | --- | --- |
| `jwt.document` | A decoded JWT: `header`, `payload` (claims), and the decoded (not verified) `signature`, plus `raw`. | Free. |

### 2. Parser contract

Reuses `Parser<TArtifact>`. One parser, `jwt.text`: accepts a raw JWT, decodes
the three segments, evaluates time claims with its clock, and **never throws**
— malformed input yields structured diagnostics.

### 3. Diagnostic contract

Reuses `Diagnostic`. Codes include `jwt.empty_input`, `jwt.invalid_segment_count`,
`jwt.invalid_base64url_*`, `jwt.invalid_*_json`, `jwt.alg_none` (error),
`jwt.token_expired` / `jwt.token_not_yet_valid` / `jwt.missing_expiration`
(warning), `jwt.large_document`, and `jwt.signature_not_verified` (always, for
transparency).

### 4. Export contract

Reuses `Exporter<TArtifact>`. Free exporters render to everyone; Pro exporters
are **registered in this build but gated** by `runExporter` behind a valid
entitlement (single-build-gated model).

| Exporter id | Target | Free / Pro |
| --- | --- | --- |
| `jwt.export.header.json` | json | Free |
| `jwt.export.payload.json` | json | Free |
| `jwt.export.claims.table.json` | json | Free |
| `jwt.export.summary.markdown` | markdown | Free |
| `jwt.export.claims.policy` | markdown (claims & security audit) | **Pro** |
| `jwt.export.sarif` | json (SARIF 2.1.0) | **Pro** |

**Offline signature verification** (`verifyJwtSignature`) is **not** an
exporter — it needs a second input (the key), which the artifact→exporter
contract can't carry. It's an injectable async engine function (Web Crypto),
gated in the UI by the suite entitlement.

### 5. Graph / table / matrix primitive

**Summary + raw-JSON views** are primary (header / payload / claims / audit /
SARIF). No graph/matrix (`canProjectGraph: false`).

### 6. Workspace

Reuses the Phase 0 `Workspace` + `jsonWorkspaceSerializer`; a NekoJWT
workspace holds `jwt.document` artifacts. Lossless round-trip (conformance).

### 7. Reuse

`@nekotools/contracts` (no new contract types), `@nekotools/schemas`,
`@nekotools/tool-runtime` (registry, runners, **entitlement gate**),
`@nekotools/lens-kit` (clock + id-factory), and the `apps/web-suite` shell
(paste/results cards, view modes, copy, the suite license badge + Pro lock).

### 8. Offline policy

`networkPolicy: 'network-forbidden'`. No fetch, no JWKS resolution, no
telemetry. Signature verification is pure Web Crypto over key material the
user pastes locally.

### 9. Entitlements

**Free:** decode, structure/base64url/JSON validation, time-claim
interpretation, signature decode, header/payload/claims-table/markdown
exports, workspace save.

**Pro (gated, in-binary):** the claims & security audit + SARIF exporters, and
offline signature verification (`verify.offline.key`, `verify.jwks`).
**Pro (advertised, future):** issuer/audience policy packs, batch audit, saved
recipes, workspace snapshots.

### 10. Out of scope

- Fetching a JWKS / resolving any URL (you paste the JWKS).
- Minting, refreshing, or managing tokens/keys.
- Guaranteeing claim *semantics* beyond structure + signature.

## Verification

- Engine: `conformance` (manifest, parser, diagnostics, free exporters,
  workspace round-trip, **monetization gating**) and `edge-cases` (parser
  robustness, the claims audit, and real HS256/ES256/RS256 sign→verify
  round-trips + tamper rejection).
- UI: free decode, Pro locks/unlocks, SARIF 2.1.0, and the offline verify
  panel (incl. a real HS256 end-to-end verification).
- Suite: typecheck · lint · `offline-guard` · full test suite, all green.
