# @nekotools/lens-license

The NekoLicense engine — a **local, offline** LICENSE-file detector and
obligations & risk auditor for the NekoTools suite. No network, no account, no
telemetry. Built to the NekoTools tool standard
([`docs/tool-standard.md`](../../docs/tool-standard.md)); charter:
[`docs/tools/nekolicense.md`](../../docs/tools/nekolicense.md).

> **Not the monetization layer.** This is the NekoLicense *tool* (it identifies
> the SPDX license of pasted LICENSE text). The suite's paid-unlock license-*key*
> verification is a separate concern living in `@nekotools/tool-runtime` +
> `apps/web-suite/src/license-store.tsx` / `LicenseBadge.tsx`.

## What it does

- **Detect** — `license.text` identifies a pasted LICENSE via signature matching
  + an explicit `SPDX-License-Identifier` tag, and reports `LicenseMeta`
  (category + permissions / conditions / limitations). Heuristic; never throws.
- **Audit** (`audit.ts`) — `auditLicense(report)` is the Pro compliance read: a
  ruleId-keyed obligations & risk posture — strong/network copyleft (GPL/AGPL),
  source-disclosure and same-license obligations, state-change duties, plus
  detection-quality signals (unidentified, SPDX-tag mismatch). It reuses the
  parser's `license.unknown` / `license.tag_mismatch` codes as ruleIds. Pure,
  local, deterministic; informational, **not legal advice**.

## Surface

| Export | id | Tier |
| --- | --- | --- |
| Detection JSON | `license.export.json` | free |
| Normalized (SPDX id) | `license.export.normalized` | free |
| Markdown summary | `license.export.markdown.summary` | free |
| Obligations & risk audit (markdown) | `license.export.audit.report` | Pro |
| SARIF 2.1.0 | `license.export.sarif` | Pro |

Pro exporters are **registered but gated** by `runExporter` behind a valid
entitlement (single-build-gated model). The future compatibility-matrix /
NOTICE generators (`export.compatibility`, `export.notice`) are advertised in
`entitlements.pro` only — not registered.

## Usage

```ts
import { ToolRegistry, runParser, runExporter } from '@nekotools/tool-runtime';
import { buildLicenseRegistration, FIXED_CLOCK } from '@nekotools/lens-license';

const registry = new ToolRegistry();
registry.register(buildLicenseRegistration(FIXED_CLOCK(new Date().toISOString())));

const parsed = runParser(registry, 'license', 'license.text', {
  raw: licenseText,
  source: { kind: 'paste', bytes: 0 },
});

// Pro SARIF — throws EntitlementError without a Pro entitlement:
const sarif = runExporter(
  registry, 'license', 'license.export.sarif',
  { artifacts: parsed.artifacts, diagnostics: parsed.diagnostics },
  proEntitlement,
);
// → SARIF 2.1.0; flags copyleft / AGPL obligations + detection issues.
```

## Tests

```bash
pnpm --filter @nekotools/lens-license test
```

- `conformance.test.ts` — manifest, detection, diagnostics, free exporters,
  workspace round-trip, **monetization gating**, and the obligations & risk
  audit (`auditLicense`).
