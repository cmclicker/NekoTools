import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import type { Entitlement, Workspace } from '@nekotools/contracts';
import {
  EntitlementError,
  ToolRegistry,
  jsonWorkspaceSerializer,
  runExporter,
  runParser,
  validateManifest,
} from '@nekotools/tool-runtime';
import { validate } from '@nekotools/schemas';

import {
  buildYamlRegistration,
  FIXED_CLOCK,
  yamlManifest,
  YAML_KIND_DOCUMENT,
  YAML_KIND_JSON_PROJECTION,
} from '../index.js';
import type {
  YamlDocument,
  YamlDocumentArtifact,
  YamlJsonProjection,
} from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-27T00:00:00.000Z');

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

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildYamlRegistration(clock));
  return r;
}

function parseText(raw: string) {
  return runParser(registry(), 'yaml', 'yaml.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function documentOf(raw: string): YamlDocumentArtifact {
  return parseText(raw).artifacts.find((a) => a.kind === YAML_KIND_DOCUMENT) as YamlDocumentArtifact;
}

describe('NekoYAML: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(yamlManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy', () => {
    expect(yamlManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('declares Pro features even though the free build ships only free ones', () => {
    expect(yamlManifest.entitlements.pro.length).toBeGreaterThan(0);
    expect(yamlManifest.entitlements.free).toContain('parse');
  });

  it('declares an out-of-scope list covering schema validation + templating', () => {
    expect(yamlManifest.outOfScope.some((s) => /schema validation/i.test(s))).toBe(true);
    expect(yamlManifest.outOfScope.some((s) => /templating/i.test(s))).toBe(true);
  });

  it('capabilities reflect current-build truth (no diff, no graph)', () => {
    expect(yamlManifest.capabilities.canSaveWorkspace).toBe(true);
    expect(yamlManifest.capabilities.canExport).toBe(true);
    expect(yamlManifest.capabilities.canDiff).toBe(false);
    expect(yamlManifest.capabilities.canProjectGraph).toBe(false);
  });
});

describe('NekoYAML: monetization gating (single-build, entitlement-gated)', () => {
  const registration = buildYamlRegistration(clock);
  const proExporterIds = ['yaml.export.schema.report', 'yaml.export.roundtrip.diff'];

  it('Pro exporters are declared AND registered as proExporters, not free', () => {
    const proIds = new Set((registration.proExporters ?? []).map((e) => e.id));
    const free = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) {
      expect(yamlManifest.exporters).toContain(id);
      expect(proIds.has(id)).toBe(true);
      expect(free.has(id)).toBe(false);
    }
  });

  it('no graph projector is registered in the free build', () => {
    expect(registration.graphProjectors ?? []).toHaveLength(0);
  });

  it('a free caller (default entitlement) is refused with EntitlementError', () => {
    const r = registry();
    const parsed = parseText('a: &x 1\nb: *x # comment\n');
    for (const id of proExporterIds) {
      expect(() =>
        runExporter(r, 'yaml', id, { artifacts: parsed.artifacts, diagnostics: parsed.diagnostics }),
      ).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the structure report + round-trip fidelity report', () => {
    const r = registry();
    const parsed = parseText('name: Neko\nport: 8080\nalias: &x 1\nref: *x # note\n');

    const report = String(
      runExporter(r, 'yaml', 'yaml.export.schema.report', {
        artifacts: parsed.artifacts,
        diagnostics: parsed.diagnostics,
      }, PRO).body,
    );
    expect(report).toContain('# NekoYAML structure report');
    expect(report).toContain('not schema validation, not schema inference');
    expect(report).toContain('top-level type: mapping');
    expect(report).toContain('anchors: yes');
    expect(report).toContain('YAML comments are not represented in JSON');

    const diff = String(
      runExporter(r, 'yaml', 'yaml.export.roundtrip.diff', {
        artifacts: parsed.artifacts,
        diagnostics: parsed.diagnostics,
      }, PRO).body,
    );
    expect(diff).toContain('# NekoYAML round-trip fidelity report');
    expect(diff).toContain('not a byte-level source diff');
    expect(diff).toContain('structure preserved: yes');
    expect(diff).toContain('anchors/aliases expanded on round trip: yes');
  });

  it('a truly unknown exporter id still throws "unknown exporter"', () => {
    expect(() =>
      runExporter(registry(), 'yaml', 'yaml.export.nope', { artifacts: [], diagnostics: [] }, PRO),
    ).toThrow(/unknown exporter/);
  });

  it('free entitlements match exactly the implemented engine-MVP set (no UI entries yet)', () => {
    const expectedFree = new Set([
      'parse',
      'validate',
      'convert.yaml-to-json',
      'convert.json-to-yaml',
      'normalize',
      'export.paths',
      'export.markdown.summary',
      'workspace.save',
    ]);
    expect(new Set(yamlManifest.entitlements.free)).toEqual(expectedFree);
  });
});

describe('NekoYAML: yaml.text parser', () => {
  it('parses a mapping and emits yaml.document + yaml.json-projection', () => {
    const result = parseText('a: 1\nb: [1, 2]\n');
    expect(result.artifacts).toHaveLength(2);
    const doc = result.artifacts.find((a) => a.kind === YAML_KIND_DOCUMENT) as YamlDocumentArtifact;
    const proj = result.artifacts.find((a) => a.kind === YAML_KIND_JSON_PROJECTION)!;
    expect((doc.value as YamlDocument).documents).toHaveLength(1);
    expect((doc.value as YamlDocument).documents[0]!.data).toEqual({ a: 1, b: [1, 2] });
    expect((proj.value as YamlJsonProjection).json).toEqual({ a: 1, b: [1, 2] });
  });

  it('handles a multi-document stream and flags yaml.multiple_documents', () => {
    const result = parseText('a: 1\n---\nb: 2\n');
    const doc = result.artifacts[0] as YamlDocumentArtifact;
    expect(doc.value.multiDocument).toBe(true);
    expect(doc.value.documents.map((d) => d.data)).toEqual([{ a: 1 }, { b: 2 }]);
    expect(result.diagnostics.find((d) => d.code === 'yaml.multiple_documents')?.severity).toBe(
      'info',
    );
  });

  it('emits yaml.empty_input (info) for empty input and still produces an artifact', () => {
    const result = parseText('');
    expect(result.artifacts.find((a) => a.kind === YAML_KIND_DOCUMENT)).toBeDefined();
    const doc = result.artifacts[0] as YamlDocumentArtifact;
    expect(doc.value.documents).toHaveLength(0);
    expect(result.diagnostics.find((d) => d.code === 'yaml.empty_input')?.severity).toBe('info');
  });

  it('emits yaml.empty_input (info) for comments-only input', () => {
    const result = parseText('# just a comment\n');
    expect(result.diagnostics.find((d) => d.code === 'yaml.empty_input')?.severity).toBe('info');
  });

  it('emits yaml.tab_indentation (error) when a tab is used for indentation', () => {
    const result = parseText('a:\n\tb: 2\n');
    const diag = result.diagnostics.find((d) => d.code === 'yaml.tab_indentation');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('error');
    expect(diag?.span?.startLine).toBe(2);
  });

  it('emits yaml.duplicate_key (warning) on a repeated mapping key', () => {
    const result = parseText('a: 1\na: 2\n');
    const diag = result.diagnostics.find((d) => d.code === 'yaml.duplicate_key');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('warning');
  });

  it('emits yaml.unresolved_alias (error) for an alias with no anchor, without throwing', () => {
    const call = () => parseText('a: *missing\n');
    expect(call).not.toThrow();
    const diag = call().diagnostics.find((d) => d.code === 'yaml.unresolved_alias');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('error');
  });

  it('resolves a valid anchor/alias and records alias metadata', () => {
    const doc = documentOf('a: &x 1\nb: *x\n');
    expect(doc.value.documents[0]!.data).toEqual({ a: 1, b: 1 });
    expect(doc.value.documents[0]!.hasAliases).toBe(true);
    expect(doc.value.documents[0]!.hasAnchors).toBe(true);
  });

  it('emits yaml.large_document (info) above the soft threshold', () => {
    const r = new ToolRegistry();
    r.register(buildYamlRegistration(clock, { largeDocumentBytes: 4 }));
    const result = runParser(r, 'yaml', 'yaml.text', {
      raw: 'key: some value here\n',
      source: { kind: 'paste', bytes: 21 },
    });
    expect(result.diagnostics.find((d) => d.code === 'yaml.large_document')?.severity).toBe('info');
  });

  it('never throws on malformed YAML and surfaces a yaml.syntax_error', () => {
    const call = () => parseText('a: [1, 2\n');
    expect(call).not.toThrow();
    expect(call().diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  it('produces a yaml.document artifact that validates against the artifact schema', () => {
    const doc = documentOf('a: 1\n');
    const validation = validate('artifact', doc);
    expect(validation.ok, validation.errors.join('; ')).toBe(true);
  });
});

describe('NekoYAML: yaml.from-json parser', () => {
  it('converts valid JSON into a yaml.document', () => {
    const result = runParser(registry(), 'yaml', 'yaml.from-json', {
      raw: '{"a":1,"b":["x","y"]}',
      source: { kind: 'paste', bytes: 20 },
    });
    const doc = result.artifacts[0] as YamlDocumentArtifact;
    expect(doc.kind).toBe(YAML_KIND_DOCUMENT);
    expect(doc.value.documents[0]!.data).toEqual({ a: 1, b: ['x', 'y'] });
  });

  it('emits yaml.syntax_error (no artifact, no throw) on malformed JSON', () => {
    const r = registry();
    const call = () =>
      runParser(r, 'yaml', 'yaml.from-json', {
        raw: 'not json',
        source: { kind: 'paste', bytes: 8 },
      });
    expect(call).not.toThrow();
    const result = call();
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe('yaml.syntax_error');
  });
});

describe('NekoYAML: exporters', () => {
  it('yaml.export.json emits the JSON projection', () => {
    const r = registry();
    const out = runExporter(r, 'yaml', 'yaml.export.json', {
      artifacts: [documentOf('a: 1\nb: two\n')],
      diagnostics: [],
    });
    expect(JSON.parse(String(out.body))).toEqual({ a: 1, b: 'two' });
  });

  it('yaml.export.json.min emits minified JSON', () => {
    const r = registry();
    const out = runExporter(r, 'yaml', 'yaml.export.json.min', {
      artifacts: [documentOf('a: 1\n')],
      diagnostics: [],
    });
    expect(String(out.body)).toBe('{"a":1}');
  });

  it('yaml.export.yaml.normalized re-emits canonical YAML', () => {
    const r = registry();
    const out = runExporter(r, 'yaml', 'yaml.export.yaml.normalized', {
      artifacts: [documentOf('{a: 1, b: [1, 2]}\n')],
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toContain('a: 1');
    expect(body).toContain('b:');
    expect(out.extension).toBe('yaml');
  });

  it('yaml.export.paths flattens to path: value lines', () => {
    const r = registry();
    const out = runExporter(r, 'yaml', 'yaml.export.paths', {
      artifacts: [documentOf('a:\n  b: 1\nc: [10]\n')],
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toContain('a.b: 1');
    expect(body).toContain('c[0]: 10');
  });

  it('yaml.export.markdown.summary describes documents + diagnostics', () => {
    const r = registry();
    const out = runExporter(r, 'yaml', 'yaml.export.markdown.summary', {
      artifacts: [documentOf('a: 1\nb: 2\n')],
      diagnostics: [
        { version: 1, id: 'd1', severity: 'warning', code: 'yaml.test', message: 'sample' },
      ],
    });
    const body = String(out.body);
    expect(body).toContain('# NekoYAML export');
    expect(body).toContain('mapping (2 keys)');
    expect(body).toContain('sample');
  });

  it('document exporters refuse a yaml.json-projection artifact (runtime enforces accepts)', () => {
    const r = registry();
    const projection = parseText('a: 1\n').artifacts.find(
      (a) => a.kind === YAML_KIND_JSON_PROJECTION,
    )!;
    for (const id of [
      'yaml.export.json',
      'yaml.export.json.min',
      'yaml.export.yaml.normalized',
      'yaml.export.paths',
    ]) {
      expect(() =>
        runExporter(r, 'yaml', id, { artifacts: [projection], diagnostics: [] }),
      ).toThrow(/does not accept artifact kind/);
    }
  });
});

describe('NekoYAML: workspace round-trip', () => {
  it('a single-document workspace round-trips losslessly', () => {
    const parsed = parseText('a: 1\nb: [1, 2]\n');
    const ws: Workspace = {
      version: 1,
      id: 'ws_yaml_single',
      toolId: 'yaml',
      toolVersion: 1,
      createdAt: '2026-05-27T00:00:00.000Z',
      updatedAt: '2026-05-27T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { viewMode: 'tree' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });

  it('a multi-document workspace round-trips losslessly', () => {
    const parsed = parseText('a: 1\n---\nb: 2\n');
    const ws: Workspace = {
      version: 1,
      id: 'ws_yaml_multi',
      toolId: 'yaml',
      toolVersion: 1,
      createdAt: '2026-05-27T00:00:00.000Z',
      updatedAt: '2026-05-27T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});

describe('NekoYAML: dependency isolation', () => {
  it("only yaml-adapter.ts imports the 'yaml' library", () => {
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
    const offenders: string[] = [];
    for (const file of collectTsFiles(srcDir)) {
      const text = readFileSync(file, 'utf8');
      const importsYaml = /from\s+['"]yaml['"]/.test(text) || /require\(\s*['"]yaml['"]\s*\)/.test(text);
      if (importsYaml && !file.endsWith('yaml-adapter.ts')) offenders.push(file);
    }
    expect(offenders, `unexpected 'yaml' imports: ${offenders.join(', ')}`).toEqual([]);
  });
});

function collectTsFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collectTsFiles(full, acc);
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}
