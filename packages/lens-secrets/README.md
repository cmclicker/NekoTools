# @nekotools/lens-secrets

The NekoSecrets engine — a **local, offline** secret/credential scanner for
the NekoTools suite. Pure string analysis: no network, no account, no
telemetry. Findings carry **masked** previews only; the raw secret is never
stored, so the artifact, every export, and the saved workspace are safe to
share.

This package is the **reference implementation** of the NekoTools tool
standard — see [`docs/tool-standard.md`](../../docs/tool-standard.md). Charter:
[`docs/tools/nekosecrets.md`](../../docs/tools/nekosecrets.md). Rule catalog:
[`docs/tools/nekosecrets-rules.md`](../../docs/tools/nekosecrets-rules.md).

## What it does

- **Detect** — 30 high-precision provider/generic patterns
  (`SECRET_RULES`) plus a Shannon **entropy** fallback for unknown
  high-randomness tokens.
- **Mask** — every finding keeps a masked preview (head + bullets + tail; short
  secrets fully bulleted) and `line`/`column`/`length`/`severity` only.
- **Redact** — `secret.report.redactedText` is the input with each secret span
  replaced by `[REDACTED:<ruleId>]` (overlaps coalesced).
- **Export** — free JSON / CSV / Markdown; gated Pro SARIF 2.1.0 / redacted /
  self-contained HTML / deterministic CI baseline.

## Usage

```ts
import { ToolRegistry, runParser, runExporter } from '@nekotools/tool-runtime';
import { buildSecretsRegistration, FIXED_CLOCK } from '@nekotools/lens-secrets';

const registry = new ToolRegistry();
registry.register(buildSecretsRegistration(FIXED_CLOCK(new Date().toISOString())));

const parsed = runParser(registry, 'secrets', 'secret.text', {
  raw: 'aws=AKIAIOSFODNN7EXAMPLE',
  source: { kind: 'paste', bytes: 24 },
});

// Free export (no entitlement needed):
const json = runExporter(registry, 'secrets', 'secret.export.json', {
  artifacts: parsed.artifacts,
  diagnostics: [],
});

// Pro export — throws EntitlementError without a Pro entitlement:
import type { Entitlement } from '@nekotools/contracts';
const pro: Entitlement = { /* tier: 'pro', features: ['*'], … */ } as Entitlement;
const sarif = runExporter(
  registry,
  'secrets',
  'secret.export.sarif',
  { artifacts: parsed.artifacts, diagnostics: [] },
  pro,
);
```

`buildSecretsRegistration(clock, { entropyThreshold, entropyMinLength })`
tunes the entropy fallback.

## Surface

| Export | id | Tier |
| --- | --- | --- |
| JSON findings | `secret.export.json` | free |
| CSV findings | `secret.export.csv` | free |
| Markdown summary | `secret.export.markdown.summary` | free |
| SARIF 2.1.0 | `secret.export.sarif` | Pro |
| Redacted source | `secret.export.redacted` | Pro |
| HTML report | `secret.export.html` | Pro |
| CI baseline | `secret.export.baseline` | Pro |

Pro exporters are **registered in this build but gated** by `runExporter`
behind a valid entitlement (single-build-gated model).

## Tests

```bash
pnpm --filter @nekotools/lens-secrets test
```

- `conformance.test.ts` — manifest, parser, diagnostics, free exporters,
  workspace round-trip, **monetization gating**.
- `rules.test.ts` — a sample per catalog rule, span dedup, precision.
- `edge-cases.test.ts` — encoding adversaries (CRLF/BOM/surrogate/NUL),
  redaction, configurable entropy, Pro corners, scale/determinism, and the
  **no-leak invariant** across every export.
