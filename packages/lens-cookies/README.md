# @nekotools/lens-cookies

The NekoCookies engine — a **local, offline** `Set-Cookie` / `Cookie` header
parser and cookie security & privacy auditor for the NekoTools suite. No
network, no account, no telemetry; cookie values never leave your machine.
Built to the NekoTools tool standard
([`docs/tool-standard.md`](../../docs/tool-standard.md)); charter:
[`docs/tools/nekocookies.md`](../../docs/tools/nekocookies.md).

## What it does

- **Parse** — `cookie.text` decodes a `Set-Cookie` response header (one cookie
  per line, with attributes) or a `Cookie` request header (name=value pairs),
  selected by `hints.mode`. Runs the per-cookie security checks (Secure,
  HttpOnly, SameSite, `__Host-`/`__Secure-` prefixes, expiry, duplicates) and
  never throws.
- **Audit** (`audit.ts`) — `auditCookies(set)` is the deeper, ruleId-keyed
  security & privacy posture the Pro tier exports. It reuses the parser's
  diagnostic codes as ruleIds, **elevates severities by real impact** (missing
  Secure → high; a session-named cookie without HttpOnly → high), and adds
  posture rules the free tier does not run (broad `Domain`, Partitioned-without-
  Secure, the `SameSite=None` privacy surface). Attribute rules apply in
  `set-cookie` mode only. Pure, local, deterministic, value-free.

## Surface

| Export | id | Tier |
| --- | --- | --- |
| Cookies JSON | `cookie.export.json` | free |
| Normalized (canonical order) | `cookie.export.normalized` | free |
| Markdown summary (value-free) | `cookie.export.markdown.summary` | free |
| Security audit report (markdown) | `cookie.export.audit.report` | Pro |
| SARIF 2.1.0 | `cookie.export.sarif` | Pro |

Pro exporters are **registered but gated** by `runExporter` behind a valid
entitlement (single-build-gated model). The future policy-preset generator
(`export.policy.preset`) is advertised in `entitlements.pro` only — not
registered.

## Usage

```ts
import { ToolRegistry, runParser, runExporter } from '@nekotools/tool-runtime';
import { buildCookiesRegistration, FIXED_CLOCK } from '@nekotools/lens-cookies';

const registry = new ToolRegistry();
registry.register(buildCookiesRegistration(FIXED_CLOCK(new Date().toISOString())));

const parsed = runParser(registry, 'cookies', 'cookie.text', {
  raw: 'Set-Cookie: sid=abc; SameSite=None',
  source: { kind: 'paste', bytes: 0 },
  hints: { mode: 'set-cookie' },
});

// Pro SARIF — throws EntitlementError without a Pro entitlement:
const sarif = runExporter(
  registry, 'cookies', 'cookie.export.sarif',
  { artifacts: parsed.artifacts, diagnostics: parsed.diagnostics },
  proEntitlement,
);
// → SARIF 2.1.0; results[].ruleId matches the free-tier diagnostic codes.
```

## Tests

```bash
pnpm --filter @nekotools/lens-cookies test
```

- `conformance.test.ts` — manifest, parser, free exporters, workspace
  round-trip, **monetization gating**, and the cookie security & privacy audit
  (`auditCookies`, incl. severity elevation + posture rules).
