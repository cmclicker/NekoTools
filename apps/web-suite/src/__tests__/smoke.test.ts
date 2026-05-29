import { describe, expect, it } from 'vitest';
import { binaryManifest, buildBinaryRegistration } from '@nekotools/lens-binary';
import { buildCodecRegistration, codecManifest } from '@nekotools/lens-codec';
import { buildCsvRegistration, csvManifest } from '@nekotools/lens-csv';
import { buildDiffRegistration, diffManifest } from '@nekotools/lens-diff';
import { buildEnvRegistration, envManifest } from '@nekotools/lens-env';
import { buildHashRegistration, hashManifest } from '@nekotools/lens-hash';
import { buildHeadersRegistration, headersManifest } from '@nekotools/lens-headers';
import { buildJsonRegistration, jsonManifest } from '@nekotools/lens-json';
import { buildPackageRegistration, packageManifest } from '@nekotools/lens-package';
import { buildRegexRegistration, regexManifest } from '@nekotools/lens-regex';
import { buildTimeRegistration, timeManifest } from '@nekotools/lens-time';

import { TOOLS } from '../tools.js';

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

  it('imports every integrated slice manifest through workspace aliases', () => {
    expect(headersManifest.name).toBe('NekoHeaders');
    expect(codecManifest.name).toBe('NekoCodec');
    expect(hashManifest.name).toBe('NekoHash');
    expect(timeManifest.name).toBe('NekoTime');
    expect(regexManifest.name).toBe('NekoRegex');
    expect(diffManifest.name).toBe('NekoDiff');
    expect(packageManifest.name).toBe('NekoPackage');
    expect(binaryManifest.name).toBe('NekoBinary');
    expect(csvManifest.name).toBe('NekoCSV');
    for (const manifest of [
      binaryManifest,
      headersManifest,
      codecManifest,
      csvManifest,
      hashManifest,
      timeManifest,
      regexManifest,
      diffManifest,
      packageManifest,
    ]) {
      expect(manifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
      expect(manifest.entitlements.free.length).toBeGreaterThan(0);
    }
  });

  it('exposes runtime registrations for every integrated slice', () => {
    for (const registration of [
      buildBinaryRegistration(),
      buildHeadersRegistration(),
      buildCodecRegistration(),
      buildCsvRegistration(),
      buildHashRegistration(),
      buildTimeRegistration(),
      buildRegexRegistration(),
      buildDiffRegistration(),
      buildPackageRegistration(),
    ]) {
      expect(registration.parsers.length).toBeGreaterThan(0);
      expect(registration.exporters.length).toBeGreaterThan(0);
    }
  });

  it('every mounted tool declares a Pro surface', () => {
    for (const tool of TOOLS) {
      expect(tool.manifest.entitlements.pro.length, `${tool.id} Pro entitlements`).toBeGreaterThan(
        0,
      );
    }
  });
});
