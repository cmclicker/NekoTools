# @nekotools/web-suite

The local, offline web shell that hosts NekoTools lenses. Phase 1.1e
ships the shell + a read-only NekoJSON manifest panel; the interactive
NekoJSON views (tree / text / table / search / copy) land in Phase
1.1f+. See [`docs/tools/nekojson-ui.md`](../../docs/tools/nekojson-ui.md)
for the UI charter.

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
