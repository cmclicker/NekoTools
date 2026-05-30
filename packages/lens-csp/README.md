# @nekotools/lens-csp

The NekoCSP engine — a **local, offline** Content-Security-Policy parser and
posture auditor for the NekoTools suite. No network, no account, no telemetry.
Built to the NekoTools tool standard
([`docs/tool-standard.md`](../../docs/tool-standard.md)); charter:
[`docs/tools/nekocsp.md`](../../docs/tools/nekocsp.md).

## What it does

- **Parse** — `csp.text` decodes a `Content-Security-Policy` header into ordered
  directives (name + sources), strips an optional `Content-Security-Policy:`
  prefix, runs the basic security checks (unsafe-inline/eval, wildcards, `data:`
  scripts, duplicates, missing default-src), and never throws.
- **Audit** (`audit.ts`) — `auditCsp(report)` is the deeper, ruleId-keyed
  posture analysis the Pro tier exports: it reuses the parser's diagnostic codes
  for the basic checks (so a SARIF ruleId matches the diagnostic a user already
  sees) and adds posture rules the free tier does not run — insecure (non-TLS)
  schemes, scheme-only `https:`, missing `base-uri` / `form-action`, and absent
  violation reporting. Pure, local, deterministic.

## Surface

| Export | id | Tier |
| --- | --- | --- |
| Directives + findings JSON | `csp.export.json` | free |
| Normalized (one directive/line) | `csp.export.normalized` | free |
| Markdown summary | `csp.export.markdown.summary` | free |
| Posture audit report (markdown) | `csp.export.report` | Pro |
| SARIF 2.1.0 | `csp.export.sarif` | Pro |

Pro exporters are **registered but gated** by `runExporter` behind a valid
entitlement (single-build-gated model). The future hardened-policy *generator*
(`export.hardened`) is advertised in `entitlements.pro` only — not registered.

## Usage

```ts
import { ToolRegistry, runParser, runExporter } from '@nekotools/tool-runtime';
import { buildCspRegistration, FIXED_CLOCK } from '@nekotools/lens-csp';

const registry = new ToolRegistry();
registry.register(buildCspRegistration(FIXED_CLOCK(new Date().toISOString())));

const parsed = runParser(registry, 'csp', 'csp.text', {
  raw: "default-src 'self'; script-src 'self' 'unsafe-inline'",
  source: { kind: 'paste', bytes: 0 },
});

// Pro SARIF — throws EntitlementError without a Pro entitlement:
const sarif = runExporter(
  registry, 'csp', 'csp.export.sarif',
  { artifacts: parsed.artifacts, diagnostics: parsed.diagnostics },
  proEntitlement,
);
// → SARIF 2.1.0; results[].ruleId matches the free-tier diagnostic codes.
```

## Tests

```bash
pnpm --filter @nekotools/lens-csp test
```

- `conformance.test.ts` — manifest, parser, free exporters, workspace
  round-trip, **monetization gating**, and the posture audit (`auditCsp`).
