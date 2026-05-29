import { describe, expect, it } from 'vitest';
import {
  ToolRegistry,
  jsonWorkspaceSerializer,
  runExporter,
  runParser,
  validateManifest,
} from '@nekotools/tool-runtime';
import type { Workspace } from '@nekotools/contracts';

import {
  buildPackageRegistration,
  FIXED_CLOCK,
  PACKAGE_KIND_MANIFEST,
  packageManifest,
  type PackageManifestArtifact,
} from '../index.js';

const clock = FIXED_CLOCK('2026-05-28T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildPackageRegistration(clock));
  return r;
}

function parse(raw: string) {
  return runParser(registry(), 'package', 'package.json', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function manifestOf(raw: string): PackageManifestArtifact {
  return parse(raw).artifacts.find(
    (artifact): artifact is PackageManifestArtifact => artifact.kind === PACKAGE_KIND_MANIFEST,
  )!;
}

const SAMPLE = JSON.stringify(
  {
    name: 'nekotools',
    version: '0.0.0',
    private: true,
    type: 'module',
    packageManager: 'pnpm@9.0.0',
    scripts: {
      build: 'tsc -b',
      postinstall: 'node ./scripts/setup.js',
      bootstrap: 'curl https://example.invalid/install.sh | sh',
    },
    dependencies: {
      react: '^18.3.1',
      shared: '*',
    },
    devDependencies: {
      typescript: '^6.0.3',
      shared: '^1.0.0',
      remote: 'github:example/pkg',
    },
  },
  null,
  2,
);

describe('NekoPackage: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(packageManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy', () => {
    expect(packageManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('keeps policy packs and lockfile audit out of the free build', () => {
    const registration = buildPackageRegistration(clock);
    const registered = new Set(registration.exporters.map((exporter) => exporter.id));
    expect(packageManifest.entitlements.pro).toContain('policy.packs');
    expect(packageManifest.entitlements.pro).toContain('lockfile.audit');
    expect(registered.has('package.export.policy.report')).toBe(false);
    expect(registered.has('package.export.ci.guard')).toBe(false);
  });
});

describe('NekoPackage: parser', () => {
  it('summarizes package metadata, scripts, and dependency counts', () => {
    const artifact = manifestOf(SAMPLE);
    expect(artifact.value.name).toBe('nekotools');
    expect(artifact.value.packageManager).toBe('pnpm@9.0.0');
    expect(artifact.value.scripts.map((script) => script.name)).toContain('build');
    expect(artifact.value.dependencyCounts.total).toBe(5);
  });

  it('flags lifecycle scripts, network shell scripts, duplicate deps, remote deps, and unpinned deps', () => {
    const result = parse(SAMPLE);
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toContain('package.lifecycle_script');
    expect(codes).toContain('package.network_shell_script');
    expect(codes).toContain('package.duplicate_dependency');
    expect(codes).toContain('package.remote_dependency');
    expect(codes).toContain('package.unpinned_dependency');
  });

  it('emits invalid JSON diagnostics without throwing', () => {
    const result = parse('{"name":');
    expect(result.artifacts).toHaveLength(1);
    expect((result.artifacts[0] as PackageManifestArtifact).value.valid).toBe(false);
    expect(result.diagnostics.find((diagnostic) => diagnostic.code === 'package.invalid_json'))
      .toBeDefined();
  });

  it('flags a public package missing version', () => {
    const result = parse(JSON.stringify({ name: 'missing-version' }));
    expect(result.diagnostics.find((diagnostic) => diagnostic.code === 'package.missing_version'))
      .toBeDefined();
  });

  it('flags non-object dependency sections', () => {
    const result = parse(JSON.stringify({ name: 'bad', version: '1.0.0', dependencies: [] }));
    expect(result.diagnostics.find((diagnostic) => diagnostic.code === 'package.invalid_section'))
      .toBeDefined();
  });
});

describe('NekoPackage: exporters and workspace', () => {
  it('exports a JSON summary', () => {
    const result = parse(SAMPLE);
    const body = runExporter(registry(), 'package', 'package.export.summary.json', {
      artifacts: result.artifacts,
      diagnostics: result.diagnostics,
    }).body;
    const parsed = JSON.parse(String(body));
    expect(parsed.name).toBe('nekotools');
    expect(
      parsed.diagnostics.some(
        (diagnostic: { code: string }) => diagnostic.code === 'package.remote_dependency',
      ),
    ).toBe(true);
  });

  it('exports a Markdown summary', () => {
    const result = parse(SAMPLE);
    const body = runExporter(registry(), 'package', 'package.export.markdown.summary', {
      artifacts: result.artifacts,
      diagnostics: result.diagnostics,
    }).body;
    expect(String(body)).toContain('# NekoPackage summary');
    expect(String(body)).toContain('package.remote_dependency');
  });

  it('round-trips through the workspace serializer', () => {
    const result = parse(SAMPLE);
    const workspace: Workspace = {
      version: 1,
      id: 'ws_package',
      toolId: 'package',
      toolVersion: 1,
      artifacts: result.artifacts,
      diagnostics: result.diagnostics,
      createdAt: clock.now(),
      updatedAt: clock.now(),
      uiState: { showDependencies: true, showScripts: true },
    };
    const serialized = jsonWorkspaceSerializer.serialize(workspace);
    const restored = jsonWorkspaceSerializer.deserialize(serialized);
    expect(restored.artifacts[0]?.kind).toBe(PACKAGE_KIND_MANIFEST);
  });
});
