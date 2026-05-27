import { describe, expect, it } from 'vitest';
import { buildDiffRegistration, diffManifest } from '@nekotools/lens-diff';
import { buildEnvRegistration, envManifest } from '@nekotools/lens-env';
import { buildJsonRegistration, jsonManifest } from '@nekotools/lens-json';

/**
 * Web-suite shell smoke test. After Phase 2.2 the shell hosts two
 * tools (NekoJSON + NekoEnv) and resolves both through the workspace
 * alias. The asserts here confirm:
 *
 *   - pnpm workspace linking (lens-* -> lens-* source)
 *   - Vite's module resolution for `@nekotools/*` packages
 *   - TS project references through `tsconfig.json`
 *   - manifest free entitlements include every UI feature this PR ships
 *
 * UI-rendering tests live in EnvApp.test.tsx / App.test.tsx; this file
 * stays DOM-free.
 */
describe('apps/web-suite scaffold', () => {
  it('imports the NekoJSON manifest through the workspace alias', () => {
    expect(jsonManifest.id).toBe('json');
    expect(jsonManifest.name).toBe('NekoJSON');
    expect(jsonManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('imports the NekoEnv manifest through the workspace alias', () => {
    expect(envManifest.id).toBe('env');
    expect(envManifest.name).toBe('NekoEnv');
    expect(envManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('NekoJSON manifest free entitlements include every feature shipped through Phase 1.1h', () => {
    expect(jsonManifest.entitlements.free).toContain('parse');
    expect(jsonManifest.entitlements.free).toContain('diff.textual');
    expect(jsonManifest.entitlements.free).toContain('view.tree');
    expect(jsonManifest.entitlements.free).toContain('view.text');
    expect(jsonManifest.entitlements.free).toContain('view.table');
    expect(jsonManifest.entitlements.free).toContain('search');
    expect(jsonManifest.entitlements.free).toContain('copy.path');
    expect(jsonManifest.entitlements.free).toContain('copy.value');
    expect(jsonManifest.capabilities.canDiff).toBe(true);
  });

  it('NekoEnv manifest free entitlements include every feature shipped through Phase 2.2', () => {
    // Engine entries (Phase 2.1).
    expect(envManifest.entitlements.free).toContain('parse');
    expect(envManifest.entitlements.free).toContain('diff.textual');
    expect(envManifest.entitlements.free).toContain('inspect.key');
    // UI entries (Phase 2.2, this PR).
    expect(envManifest.entitlements.free).toContain('view.table');
    expect(envManifest.entitlements.free).toContain('view.text');
    expect(envManifest.entitlements.free).toContain('view.diff');
    expect(envManifest.entitlements.free).toContain('search');
    expect(envManifest.entitlements.free).toContain('copy.key');
    expect(envManifest.entitlements.free).toContain('copy.value');
    expect(envManifest.entitlements.free).toContain('mask.value');
    expect(envManifest.capabilities.canDiff).toBe(true);
  });

  it('exposes buildJsonRegistration so the shell can wire NekoJSON into ToolRegistry', () => {
    const reg = buildJsonRegistration();
    expect(reg.manifest.id).toBe('json');
    expect(reg.parsers.length).toBeGreaterThan(0);
    expect(reg.exporters.length).toBeGreaterThan(0);
  });

  it('exposes buildEnvRegistration so the shell can wire NekoEnv into ToolRegistry', () => {
    const reg = buildEnvRegistration();
    expect(reg.manifest.id).toBe('env');
    expect(reg.parsers.length).toBeGreaterThan(0);
    expect(reg.exporters.length).toBeGreaterThan(0);
  });

  it('imports the NekoDiff manifest through the workspace alias', () => {
    expect(diffManifest.id).toBe('diff');
    expect(diffManifest.name).toBe('NekoDiff');
    expect(diffManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
    expect(diffManifest.capabilities.canDiff).toBe(true);
  });

  it('NekoDiff manifest free entitlements include every feature shipped in this slice', () => {
    expect(diffManifest.entitlements.free).toContain('diff.text');
    expect(diffManifest.entitlements.free).toContain('diff.json');
    expect(diffManifest.entitlements.free).toContain('diff.yaml');
    expect(diffManifest.entitlements.free).toContain('summary.counts');
    expect(diffManifest.entitlements.free).toContain('view.unified');
    expect(diffManifest.entitlements.free).toContain('export.unified');
    expect(diffManifest.entitlements.free).toContain('copy.output');
  });

  it('NekoDiff keeps semantic diff + signed bundle Pro (advertised, not in the free set)', () => {
    expect(diffManifest.entitlements.pro).toContain('diff.semantic');
    expect(diffManifest.entitlements.pro).toContain('bundle.signed');
    expect(diffManifest.entitlements.free).not.toContain('diff.semantic');
  });

  it('exposes buildDiffRegistration so the shell can wire NekoDiff into ToolRegistry', () => {
    const reg = buildDiffRegistration();
    expect(reg.manifest.id).toBe('diff');
    expect(reg.parsers.length).toBe(3);
    expect(reg.exporters.length).toBeGreaterThan(0);
  });
});
