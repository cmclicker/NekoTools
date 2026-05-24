# @nekotools/web-suite

The local, offline web shell that hosts NekoTools lenses. It hosts two
tools as top-level tabs today — **NekoJSON** (tree / text / table views,
search, copy) and **NekoEnv** (table / text / diff views, search, copy,
value masking) — each shipping its full free-tier UI. **NekoLogs** is the
next tool to wire in (engine shipped; UI queued). See
[`docs/tools/nekojson-ui.md`](../../docs/tools/nekojson-ui.md) for the
shell/UI charter.

## Stack

Vite + React + TypeScript. No external CDN, no remote fonts, no
analytics. Everything is bundled.

## Commands

```bash
pnpm --filter @nekotools/web-suite dev        # local dev server
pnpm --filter @nekotools/web-suite build      # static build into dist/
pnpm --filter @nekotools/web-suite preview    # preview the built bundle
pnpm --filter @nekotools/web-suite test       # smoke tests (vitest)
pnpm --filter @nekotools/web-suite typecheck  # tsc --noEmit
pnpm --filter @nekotools/web-suite lint       # eslint src
```
