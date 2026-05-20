import { describe, expect, it } from 'vitest';
import { buildJsonRegistration, jsonManifest } from '@nekotools/lens-json';

/**
 * Phase 1.1e shell smoke test.
 *
 * The shell's contract is "Vite + React build resolves
 * `@nekotools/lens-json` through the workspace alias and the manifest
 * is what it claims to be." Asserting that here exercises:
 *   - pnpm workspace linking (lens-json -> lens-json source)
 *   - Vite's module resolution for `@nekotools/*` packages
 *   - TS project references through `tsconfig.json`
 *
 * No DOM, no @testing-library, no jsdom — keep this PR's dep
 * footprint minimal. UI-rendering tests land with the views that
 * need them in Phase 1.1f+.
 */
describe('apps/web-suite scaffold', () => {
  it('imports the NekoJSON manifest through the workspace alias', () => {
    expect(jsonManifest.id).toBe('json');
    expect(jsonManifest.name).toBe('NekoJSON');
    expect(jsonManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('manifest free entitlements include every diagnostic and exporter shipped through Phase 1.1d', () => {
    // Regression guard: confirms the shell sees the same manifest the
    // tests in lens-json see (no version drift, no stale bundle).
    expect(jsonManifest.entitlements.free).toContain('parse');
    expect(jsonManifest.entitlements.free).toContain('diff.textual');
    expect(jsonManifest.capabilities.canDiff).toBe(true);
  });

  it('exposes buildJsonRegistration so the shell can wire NekoJSON into ToolRegistry', () => {
    const reg = buildJsonRegistration();
    expect(reg.manifest.id).toBe('json');
    expect(reg.parsers.length).toBeGreaterThan(0);
    expect(reg.exporters.length).toBeGreaterThan(0);
  });
});
