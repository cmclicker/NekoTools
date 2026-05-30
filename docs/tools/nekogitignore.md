# NekoGitignore — tool charter (IMPLEMENTED)

> Status: **IMPLEMENTED — engine + UI + monetization shipped.** NekoGitignore
> follows the NekoTools tool standard ([tool-standard.md](../tool-standard.md));
> NekoSecrets is the reference implementation and NekoJWT / NekoCSP / NekoCookies
> are sibling real-gated-Pro wedges. The canonical manifest lives at
> `packages/lens-gitignore/src/manifest.ts`.

**Tool identity.** NekoGitignore — a local `.gitignore` parser, path tester, and
secret-leak coverage auditor.

- **Package:** `@nekotools/lens-gitignore`.
- **UI:** the NekoGitignore tab in `apps/web-suite` (PROJECT category).

A `.gitignore` is the last line of defense against committing a secret. If it
doesn't cover `.env`, `*.pem`, `id_rsa`, or `.npmrc`, an accidental `cp` + commit
leaks credentials into history. NekoGitignore makes verifying that coverage a
local, repeatable, CI-wireable step.

## Problem statement

Developers reason about `.gitignore` matching by trial and error, and rarely
verify that it actually covers the files that must never be committed. There is
no quick, local way to ask "would this ruleset let me commit a private key?" and
gate the answer in CI.

## Product thesis

Parse + test a `.gitignore` locally for free; the Pro tier adds a secret-leak
coverage audit (does the ruleset ignore the universally-sensitive paths?) and
SARIF export so a `.gitignore` review drops straight into CI code-scanning. No
account, no telemetry, no network, no filesystem.

## What NekoGitignore is / is not

- **Is:** a local rule classifier, a path-match tester (pragmatic glob subset),
  a secret-coverage auditor, and a SARIF 2.1.0 reporter.
- **Is not:** a reader of a real working tree / `.git/info/exclude`, a bit-exact
  reimplementation of Git's pathspec engine, a nested-`.gitignore` merger (Pro,
  future), or a content secret-scanner (that's NekoSecrets).

## The 10 charter questions

### 1. Artifact kind

One kind under `gitignore.*`:

| Kind | Value | Status |
| --- | --- | --- |
| `gitignore.parsed` | Classified rules (negation/anchor/dir-only/glob) + per-path ignored verdicts when test paths are supplied. | Free. |

### 2. Parser contract

Reuses `Parser<TArtifact>`. One parser, `gitignore.text`: classifies each line
and (with `hints.paths`) decides each path's verdict (last match wins; `!`
re-includes). **Never throws**; no filesystem.

### 3. Diagnostic contract

Reuses `Diagnostic`. Codes: `gitignore.empty_input` (info), `gitignore.duplicate`
(info). The Pro audit reuses `gitignore.duplicate` as a ruleId and adds
audit-only ruleIds (`gitignore.uncovered_secret`, `gitignore.uncovered_artifact`).

### 4. Export contract

Reuses `Exporter<TArtifact>`. Free exporters render to everyone; Pro exporters
are **registered in this build but gated** by `runExporter` behind a valid
entitlement (single-build-gated model).

| Exporter id | Target | Free / Pro |
| --- | --- | --- |
| `gitignore.export.json` | json | Free |
| `gitignore.export.normalized` | plaintext | Free |
| `gitignore.export.markdown.summary` | markdown | Free |
| `gitignore.export.audit.report` | markdown (secret-coverage audit) | **Pro** |
| `gitignore.export.sarif` | json (SARIF 2.1.0) | **Pro** |

The regex / merged generators (`export.regex`, `export.merged`) are advertised
in `entitlements.pro` only — they are **not** registered exporters in this build.

### 5. Graph / table / matrix primitive

**Rule table + path-verdict table + raw projections** are primary. No
graph/matrix (`canProjectGraph: false`).

### 6. Workspace

Reuses the Phase 0 `Workspace` + `jsonWorkspaceSerializer`; a NekoGitignore
workspace holds `gitignore.parsed` artifacts. Lossless round-trip (conformance).

### 7. Reuse

`@nekotools/contracts` (no new contract types), `@nekotools/schemas`,
`@nekotools/tool-runtime` (registry, runners, **entitlement gate**),
`@nekotools/lens-kit` (clock + id-factory), and the `apps/web-suite` shell
(paste/results cards, view modes, copy, the suite license badge + Pro lock).

### 8. Offline policy

`networkPolicy: 'network-forbidden'`. It never reads a working tree or `.git`,
never touches the network. Classification, matching, and auditing are pure local
analysis over pasted text.

### 9. Entitlements

**Free:** parse, pattern classification, path testing, structure diagnostics,
JSON / normalized / markdown-summary exports, copy, workspace save.

**Pro (gated, in-binary):** the secret-coverage audit report + SARIF exporters.
**Pro (advertised, future):** merge nested files, explain-match, template
library, redundancy analysis, repo-local scan, regex / merged exports, workspace
snapshots.

### 10. Out of scope

- Reading a real working tree or `.git/info/exclude` from disk.
- The full Git pathspec edge cases (this is a pragmatic glob subset).
- The parent-directory re-inclusion rule for negated patterns.
- Merging nested `.gitignore` files by directory precedence (Pro, future).
- Network access of any kind during inspection.

## Verification

- Engine: `conformance` (manifest, classification, path testing, diagnostics,
  free exporters, workspace round-trip, **monetization gating**, and the
  `auditGitignore` secret-coverage audit).
- UI: free rule/path tables, the Pro lock when free, the unlocked coverage
  audit, and SARIF 2.1.0.
- Suite: typecheck · lint · `offline-guard` · full test suite, all green.
