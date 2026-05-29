# NekoSecrets example fixture

`sample-config.env` is a **100% synthetic** demo input for NekoSecrets — every
"credential" is a fake/placeholder value (e.g. AWS's documented example key,
repeated characters). It is safe to commit and share.

## Use it

1. Open NekoSecrets in the web suite (SECURITY category).
2. Click **Load a local file** and pick `sample-config.env` — it is read
   locally by your browser and never uploaded.
3. You should see findings across all three severities, plus four lines that
   are correctly **not** flagged.

## What it should detect

| Line | Rule | Severity |
| --- | --- | --- |
| `AWS_ACCESS_KEY_ID=AKIA…` | `aws.access-key` | high |
| `GITHUB_TOKEN=ghp_…` | `github.token` | high |
| `OPENAI_API_KEY=sk-proj-…` | `openai.key` | high |
| `DATABASE_URL=postgres://app:…@…` | `uri.basic-auth` | high |
| `DB_PASSWORD = "hunter2hunter2"` | `generic.assignment` | medium |
| `SESSION_BLOB=Zk7Q…` | `entropy.high` | low |
| `LOG_LEVEL`, `FEATURE_FLAG_…`, the `note:` line | — | not flagged |

Findings show **masked** previews only; the raw value never leaves the input
box. See [`docs/tools/nekosecrets-rules.md`](../../docs/tools/nekosecrets-rules.md)
for the full rule catalog.
