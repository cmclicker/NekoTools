import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The `@nekotools/*` workspace packages publish raw TypeScript
// (`exports` → `./src/index.ts`) with no build step. Vitest resolves them
// through vite's dev transform, but the production `vite build` (Rollup)
// cannot resolve a bare `@nekotools/lens-*` specifier to a `.ts` entry, so it
// reported "Rollup failed to resolve import". Aliasing each workspace package
// to its source entry makes the production build resolve + bundle them.
const here = dirname(fileURLToPath(import.meta.url));
const packagesDir = resolve(here, '../../packages');
const workspaceAlias = Object.fromEntries(
  readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => [`@nekotools/${entry.name}`, resolve(packagesDir, entry.name, 'src/index.ts')]),
);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: { alias: workspaceAlias },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
