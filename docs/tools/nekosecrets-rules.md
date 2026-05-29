# NekoSecrets — rule catalog

The detection rules live in `packages/lens-secrets/src/rules.ts` (that file is
the source of truth; this doc is generated from it for reference). Rules are
deliberately **specific** — provider prefix + length/charset — to keep
precision high. The Shannon-**entropy fallback** is the catch-all for unknown
high-randomness tokens not covered by a rule.

Every finding stores a **masked** preview only; the raw secret is never
recorded. Severities map to diagnostics as high → error, medium → warning,
low → info, and to SARIF levels as high → error, medium → warning, low → note.

## Pattern rules (30)

| Rule id | Provider | Severity | Matches (shape) |
| --- | --- | --- | --- |
| `aws.access-key` | AWS | high | `AKIA`/`ASIA`/`ABIA`/`ACCA` + 16 `[0-9A-Z]` |
| `azure.storage-key` | Azure | high | `AccountKey=` + 86 base64 + `==` (value captured) |
| `google.api-key` | Google | high | `AIza` + 35 `[0-9A-Za-z_-]` |
| `google.oauth-token` | Google | medium | `ya29.` + 20+ `[0-9A-Za-z_-]` |
| `digitalocean.token` | DigitalOcean | high | `do[oprt]_v1_` + 64 hex |
| `heroku.api-key` | Heroku | high | `heroku_` + 32+ hex |
| `github.token` | GitHub | high | `gh[posru]_` + 36 `[A-Za-z0-9]` |
| `github.pat` | GitHub | high | `github_pat_` + 22+ `[A-Za-z0-9_]` |
| `gitlab.pat` | GitLab | high | `glpat-` + 20+ `[A-Za-z0-9_-]` |
| `npm.token` | npm | high | `npm_` + 36 `[A-Za-z0-9]` |
| `pypi.token` | PyPI | high | `pypi-AgEIcHlwaS5vcmc` + 50+ |
| `slack.token` | Slack | high | `xox[baprs]-` + 10–48 |
| `slack.app-token` | Slack | high | `xapp-N-…-N-…` |
| `slack.webhook` | Slack | high | `https://hooks.slack.com/services/…` |
| `sendgrid.key` | SendGrid | high | `SG.` + 22 + `.` + 43 |
| `twilio.api-key` | Twilio | high | `SK` + 32 hex |
| `telegram.bot-token` | Telegram | high | 8–10 digits + `:AA` + 32+ |
| `discord.bot-token` | Discord | medium | `[MNO]` + 23–25 + `.` + 6 + `.` + 27+ |
| `stripe.secret-live` | Stripe | high | `(sk\|rk)_live_` + 16+ |
| `stripe.secret-test` | Stripe | medium | `(sk\|rk)_test_` + 16+ |
| `square.token` | Square | high | `sq0(atp\|csp)-` + 22+ |
| `shopify.token` | Shopify | high | `shp(at\|ca\|pa\|ss)_` + 32 hex |
| `anthropic.key` | Anthropic | high | `sk-ant-(api\|admin)NN-` + 40+ |
| `openai.key` | OpenAI | high | `sk-` (not `ant-`) `(proj-)?` + 20+ |
| `huggingface.token` | Hugging Face | high | `hf_` + 34+ |
| `private.key` | PEM | high | `-----BEGIN … PRIVATE KEY-----` |
| `age.secret-key` | age | high | `AGE-SECRET-KEY-1` + 58 `[0-9A-Z]` |
| `jwt` | JWT | medium | `eyJ…`.`…`.`…` (three base64url segments) |
| `uri.basic-auth` | Generic | high | `scheme://user:pass@` (password captured) |
| `generic.assignment` | Generic | medium | `password`/`secret`/`api_key`/… `=` value (value captured) |

## Entropy fallback

| Rule id | Severity | Behavior |
| --- | --- | --- |
| `entropy.high` | low | A token of ≥ `entropyMinLength` chars (default 20) from `[A-Za-z0-9+/=_-]` whose Shannon entropy ≥ `entropyThreshold` (default 4.0 bits/char), that does **not** overlap a pattern hit. Thresholds are injectable via `createSecretTextParser({ entropyThreshold, entropyMinLength })`. |

## Overlap handling

- Two pattern rules matching the **same span** collapse to a single finding,
  keeping the higher severity (e.g. a key that is both `aws.access-key` and a
  `generic.assignment`).
- The entropy fallback never fires inside a span already covered by a pattern
  rule, so a known key is reported once, not twice.

## False positives

Severities and the in-app severity filter are the triage tools. `entropy.high`
is the most heuristic; `jsonwebtoken` and `discord.bot-token` are medium for
the same reason. Adding an allowlist is an advertised Pro feature
(`allowlist.manage`).

## Adding a rule

1. Add an entry to `SECRET_RULES` in `rules.ts` (global regex; set `group`
   when only part of the match is the secret; tag `provider` + `severity`).
2. Add a sample to `SAMPLES` in `__tests__/rules.test.ts` — the
   "no rule is untested" test fails otherwise.
3. Re-run `pnpm --filter @nekotools/lens-secrets test`.
4. Update this table.
