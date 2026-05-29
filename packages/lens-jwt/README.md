# @nekotools/lens-jwt

The NekoJWT engine — a **local, offline** JWT decoder, claims/security
auditor, and signature verifier for the NekoTools suite. No network, no
account, no telemetry. Built to the NekoTools tool standard
([`docs/tool-standard.md`](../../docs/tool-standard.md)); charter:
[`docs/tools/nekojwt.md`](../../docs/tools/nekojwt.md).

## What it does

- **Decode** — `jwt.text` parses header / payload / signature, evaluates time
  claims with an injected clock, and never throws (malformed input →
  diagnostics).
- **Audit** (`audit.ts`) — a claims & security audit: `alg=none`, expiry/nbf,
  missing recommended claims, over-long lifetime, symmetric-alg note.
- **Verify** (`verify.ts`) — `verifyJwtSignature(token, key)` checks the
  signature **offline** via Web Crypto: HS256/384/512, RS*, PS*, ES* against a
  shared secret / public-key PEM / JWK / JWKS. Never throws.

## Surface

| Export | id | Tier |
| --- | --- | --- |
| Header JSON | `jwt.export.header.json` | free |
| Payload JSON | `jwt.export.payload.json` | free |
| Claims table JSON | `jwt.export.claims.table.json` | free |
| Markdown summary | `jwt.export.summary.markdown` | free |
| Claims & security audit | `jwt.export.claims.policy` | Pro |
| SARIF 2.1.0 | `jwt.export.sarif` | Pro |
| Offline signature verify | `verifyJwtSignature()` (engine fn) | Pro (UI-gated) |

Pro exporters are **registered but gated** by `runExporter` behind a valid
entitlement. `verifyJwtSignature` isn't an exporter (it needs a key input) —
it's an injectable async engine function the UI calls when entitled.

## Usage

```ts
import { ToolRegistry, runParser, runExporter } from '@nekotools/tool-runtime';
import { buildJwtRegistration, FIXED_CLOCK, verifyJwtSignature } from '@nekotools/lens-jwt';

const registry = new ToolRegistry();
registry.register(buildJwtRegistration(FIXED_CLOCK(new Date().toISOString())));

const parsed = runParser(registry, 'jwt', 'jwt.text', {
  raw: token,
  source: { kind: 'paste', bytes: token.length },
});

// Pro audit — throws EntitlementError without a Pro entitlement:
const audit = runExporter(
  registry, 'jwt', 'jwt.export.claims.policy',
  { artifacts: parsed.artifacts, diagnostics: parsed.diagnostics },
  proEntitlement,
);

// Offline signature verification (no network):
const result = await verifyJwtSignature(token, { kind: 'secret', secret: 's3cr3t' });
// → { verified: true, alg: 'HS256' }
```

## Tests

```bash
pnpm --filter @nekotools/lens-jwt test
```

- `conformance.test.ts` — manifest, parser, free exporters, workspace
  round-trip, **monetization gating**.
- `edge-cases.test.ts` — parser robustness, the claims audit, and real
  HS256 / ES256 / RS256 sign→verify round-trips + tamper rejection.
