# @nekotools/lens-gitignore

The NekoGitignore engine — a **local, offline** `.gitignore` parser, path
tester, and secret-leak coverage auditor for the NekoTools suite. No
filesystem, no repo, no network. Built to the NekoTools tool standard
([`docs/tool-standard.md`](../../docs/tool-standard.md)); charter:
[`docs/tools/nekogitignore.md`](../../docs/tools/nekogitignore.md).

## What it does

- **Parse** — `gitignore.text` classifies each line (negation / anchor /
  dir-only / glob / comment / blank) and, when `hints.paths` are supplied,
  decides whether each path is ignored (last matching rule wins; `!`
  re-includes). Pragmatic glob subset; never throws.
- **Audit** (`audit.ts`) — `auditGitignore(report)` is the Pro security check.
  Its headline is **secret coverage**: it compiles the ruleset with the engine's
  real matcher and tests a built-in list of universally-sensitive paths (`.env`,
  `*.pem`, `id_rsa`, `credentials.json`, `.npmrc`, …) — any path the ruleset
  does **not** ignore is a coverage gap that risks committing a secret. Plus
  duplicate-pattern hygiene. Pure, local, deterministic.

## Surface

| Export | id | Tier |
| --- | --- | --- |
| Rules + path tests JSON | `gitignore.export.json` | free |
| Normalized (patterns only) | `gitignore.export.normalized` | free |
| Markdown summary | `gitignore.export.markdown.summary` | free |
| Secret-coverage audit report (markdown) | `gitignore.export.audit.report` | Pro |
| SARIF 2.1.0 | `gitignore.export.sarif` | Pro |

Pro exporters are **registered but gated** by `runExporter` behind a valid
entitlement (single-build-gated model). The future regex / merged generators
(`export.regex`, `export.merged`) are advertised in `entitlements.pro` only —
not registered.

## Usage

```ts
import { ToolRegistry, runParser, runExporter } from '@nekotools/tool-runtime';
import { buildGitignoreRegistration, FIXED_CLOCK } from '@nekotools/lens-gitignore';

const registry = new ToolRegistry();
registry.register(buildGitignoreRegistration(FIXED_CLOCK(new Date().toISOString())));

const parsed = runParser(registry, 'gitignore', 'gitignore.text', {
  raw: 'node_modules/\ndist/',
  source: { kind: 'paste', bytes: 0 },
});

// Pro SARIF — throws EntitlementError without a Pro entitlement:
const sarif = runExporter(
  registry, 'gitignore', 'gitignore.export.sarif',
  { artifacts: parsed.artifacts, diagnostics: parsed.diagnostics },
  proEntitlement,
);
// → SARIF 2.1.0; flags uncovered secret paths (.env, *.pem, id_rsa, …).
```

## Tests

```bash
pnpm --filter @nekotools/lens-gitignore test
```

- `conformance.test.ts` — manifest, classification, path testing, diagnostics,
  free exporters, workspace round-trip, **monetization gating**, and the
  secret-coverage audit (`auditGitignore`).
