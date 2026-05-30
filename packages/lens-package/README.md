# @nekotools/lens-package

The NekoPackage engine — a **local, offline** `package.json` inspector and
dependency & license-risk auditor for the NekoTools suite. No network, no
account, no telemetry. Built to the NekoTools tool standard
([`docs/tool-standard.md`](../../docs/tool-standard.md)); charter:
[`docs/tools/nekopackage.md`](../../docs/tools/nekopackage.md).

## What it does

- **Parse** — `package.json` decodes a manifest into metadata, scripts (with
  `lifecycle` / `network-shell` / `destructive` risk flags), dependency sections
  (with `remote` / `unpinned` flags), duplicate dependencies, and counts. Never
  throws — malformed input yields diagnostics.
- **Audit** (`audit.ts`) — `auditPackage(doc)` is the deeper, ruleId-keyed
  dependency & license-risk posture the Pro tier exports. It adds **license-risk
  SPDX classification** the free tier does not do (copyleft / missing / unknown)
  and elevates the parser's script + dependency risk signals into a unified,
  severity-ranked report. Reuses the parser's diagnostic codes as ruleIds so a
  SARIF ruleId matches the diagnostic a user already sees. Pure, local,
  deterministic.

## Surface

| Export | id | Tier |
| --- | --- | --- |
| JSON summary | `package.export.summary.json` | free |
| Markdown summary | `package.export.markdown.summary` | free |
| Risk policy report (markdown) | `package.export.policy.report` | Pro |
| SARIF 2.1.0 | `package.export.sarif` | Pro |

Pro exporters are **registered but gated** by `runExporter` behind a valid
entitlement (single-build-gated model). The future CI-guard generator
(`ci.guard.export`) is advertised in `entitlements.pro` only — not registered.

## Usage

```ts
import { ToolRegistry, runParser, runExporter } from '@nekotools/tool-runtime';
import { buildPackageRegistration, FIXED_CLOCK } from '@nekotools/lens-package';

const registry = new ToolRegistry();
registry.register(buildPackageRegistration(FIXED_CLOCK(new Date().toISOString())));

const parsed = runParser(registry, 'package', 'package.json', {
  raw: packageJsonText,
  source: { kind: 'paste', bytes: 0 },
});

// Pro SARIF — throws EntitlementError without a Pro entitlement:
const sarif = runExporter(
  registry, 'package', 'package.export.sarif',
  { artifacts: parsed.artifacts, diagnostics: parsed.diagnostics },
  proEntitlement,
);
// → SARIF 2.1.0; results[].ruleId matches the free-tier diagnostic codes.
```

## Tests

```bash
pnpm --filter @nekotools/lens-package test
```

- `conformance.test.ts` — manifest, parser, free exporters, workspace
  round-trip, **monetization gating**, and the dependency & license-risk audit
  (`auditPackage`, incl. SPDX license classification).
