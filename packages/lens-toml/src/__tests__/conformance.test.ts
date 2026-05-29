import { describe, expect, it } from 'vitest';
import type { Artifact, Workspace } from '@nekotools/contracts';
import {
  ToolRegistry,
  jsonWorkspaceSerializer,
  runExporter,
  runParser,
  validateManifest,
} from '@nekotools/tool-runtime';
import { validate } from '@nekotools/schemas';

import { FIXED_CLOCK, TOML_KIND_PARSED, buildTomlRegistration, tomlManifest } from '../index.js';
import type { ParsedToml, TomlParsedArtifact } from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-28T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildTomlRegistration(clock));
  return r;
}

function parseText(raw: string) {
  return runParser(registry(), 'toml', 'toml.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function parsedOf(raw: string): TomlParsedArtifact {
  return parseText(raw).artifacts.find((a) => a.kind === TOML_KIND_PARSED) as TomlParsedArtifact;
}

function dataOf(raw: string): ParsedToml['data'] {
  return parsedOf(raw).value.data;
}

describe('NekoTOML: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(tomlManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy (no fetch, ever)', () => {
    expect(tomlManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('declares Pro features even though the free build ships only free ones', () => {
    expect(tomlManifest.entitlements.pro.length).toBeGreaterThan(0);
    expect(tomlManifest.entitlements.free).toContain('parse');
  });

  it('declares an out-of-scope list covering network resolution + multi-line constructs', () => {
    expect(tomlManifest.outOfScope.some((s) => /fetch|resolv|network/i.test(s))).toBe(true);
    expect(tomlManifest.outOfScope.some((s) => /multi-line/i.test(s))).toBe(true);
  });

  it('capabilities reflect current-build truth (no diff, no graph)', () => {
    expect(tomlManifest.capabilities.canSaveWorkspace).toBe(true);
    expect(tomlManifest.capabilities.canExport).toBe(true);
    expect(tomlManifest.capabilities.canDiff).toBe(false);
    expect(tomlManifest.capabilities.canProjectGraph).toBe(false);
  });
});

describe('NekoTOML: monetization safety', () => {
  const registration = buildTomlRegistration(clock);
  const proExporterIds = ['toml.export.types', 'toml.export.schema.json'];

  it('no Pro exporter is registered in the free build', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) expect(registered.has(id)).toBe(false);
  });

  it('runExporter throws "unknown exporter" for every Pro exporter id', () => {
    const r = registry();
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'toml', id, { artifacts: [], diagnostics: [] })).toThrow(
        /unknown exporter/,
      );
    }
  });

  it('the manifest declares Pro exporters that are NOT in the registered set', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) {
      expect(tomlManifest.exporters).toContain(id);
      expect(registered.has(id)).toBe(false);
    }
  });

  it('free entitlements match exactly the implemented vertical-slice set', () => {
    const expectedFree = new Set([
      'parse',
      'inspect.tree',
      'diagnostics.structure',
      'convert.json',
      'normalize.document',
      'export.json',
      'export.normalized',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ]);
    expect(new Set(tomlManifest.entitlements.free)).toEqual(expectedFree);
  });
});

describe('NekoTOML: toml.text parser', () => {
  it('decodes simple key/value pairs with scalar types', () => {
    const data = dataOf(
      ['title = "NekoTOML"', 'count = 42', 'ratio = 3.14', 'enabled = true'].join('\n'),
    ) as Record<string, unknown>;
    expect(data).toEqual({ title: 'NekoTOML', count: 42, ratio: 3.14, enabled: true });
  });

  it('decodes integers in hex/octal/binary with underscore separators', () => {
    const data = dataOf(
      ['a = 0xFF', 'b = 0o17', 'c = 0b1010', 'd = 1_000_000'].join('\n'),
    ) as Record<string, number>;
    expect(data).toEqual({ a: 255, b: 15, c: 10, d: 1000000 });
  });

  it('decodes tables into nested objects', () => {
    const data = dataOf(['[server]', 'host = "localhost"', 'port = 8080'].join('\n'));
    expect(data).toEqual({ server: { host: 'localhost', port: 8080 } });
  });

  it('decodes dotted keys and nested table paths', () => {
    const data = dataOf(['[a.b]', 'c.d = 1'].join('\n'));
    expect(data).toEqual({ a: { b: { c: { d: 1 } } } });
  });

  it('decodes arrays of tables into arrays of objects', () => {
    const data = dataOf(
      ['[[product]]', 'name = "hammer"', '[[product]]', 'name = "nail"'].join('\n'),
    );
    expect(data).toEqual({ product: [{ name: 'hammer' }, { name: 'nail' }] });
  });

  it('decodes inline tables and single-line arrays', () => {
    const data = dataOf(
      ['point = { x = 1, y = 2 }', 'tags = ["a", "b", "c"]'].join('\n'),
    );
    expect(data).toEqual({ point: { x: 1, y: 2 }, tags: ['a', 'b', 'c'] });
  });

  it('preserves date-times as strings (never reinterprets to a host Date)', () => {
    const data = dataOf('when = 2026-05-28T12:00:00Z') as Record<string, unknown>;
    expect(data.when).toBe('2026-05-28T12:00:00Z');
  });

  it('ignores comments, including a "#" inside a quoted string', () => {
    const data = dataOf(['# a comment', 'url = "https://x/#frag" # trailing'].join('\n'));
    expect(data).toEqual({ url: 'https://x/#frag' });
  });

  it('emits toml.empty_input (info) for empty input and still produces an artifact', () => {
    const result = parseText('   \n  # only a comment\n');
    expect(result.artifacts.find((a) => a.kind === TOML_KIND_PARSED)).toBeDefined();
    // comment-only is not whitespace-only, so it parses to an empty table rather than empty_input;
    // a purely whitespace input is the empty_input case:
    const empty = parseText('   ');
    expect(empty.diagnostics.find((d) => d.code === 'toml.empty_input')?.severity).toBe('info');
    expect((empty.artifacts[0] as TomlParsedArtifact).value.valid).toBe(false);
  });

  it('emits toml.parse_error (error) with a line number, without throwing', () => {
    const call = () => parseText(['ok = 1', 'this is not valid'].join('\n'));
    expect(call).not.toThrow();
    const result = call();
    const diag = result.diagnostics.find((d) => d.code === 'toml.parse_error');
    expect(diag?.severity).toBe('error');
    expect(diag?.message).toContain('line 2');
    expect((result.artifacts[0] as TomlParsedArtifact).value.valid).toBe(false);
  });

  it('emits toml.duplicate_key (warning) and keeps the first value', () => {
    const result = parseText(['x = 1', 'x = 2'].join('\n'));
    const diag = result.diagnostics.find((d) => d.code === 'toml.duplicate_key');
    expect(diag?.severity).toBe('warning');
    expect((result.artifacts[0] as TomlParsedArtifact).value.data).toEqual({ x: 1 });
  });

  it('emits toml.unsupported (warning) for a multi-line array and skips it', () => {
    const result = parseText(['kept = 1', 'arr = ['].join('\n'));
    const diag = result.diagnostics.find((d) => d.code === 'toml.unsupported');
    expect(diag?.severity).toBe('warning');
    expect((result.artifacts[0] as TomlParsedArtifact).value.data).toEqual({ kept: 1 });
  });

  it('produces a toml.parsed artifact that validates against the artifact schema', () => {
    const validation = validate('artifact', parsedOf('[a]\nb = 1'));
    expect(validation.ok, validation.errors.join('; ')).toBe(true);
  });
});

describe('NekoTOML: exporters', () => {
  it('toml.export.json emits the decoded tree as pretty JSON', () => {
    const out = runExporter(registry(), 'toml', 'toml.export.json', {
      artifacts: [parsedOf('[server]\nport = 8080')],
      diagnostics: [],
    });
    expect(JSON.parse(String(out.body))).toEqual({ server: { port: 8080 } });
  });

  it('toml.export.normalized re-serializes to canonical TOML (round-trips)', () => {
    const src = ['port = 8080', '', '[server]', 'host = "localhost"'].join('\n');
    const out = runExporter(registry(), 'toml', 'toml.export.normalized', {
      artifacts: [parsedOf(src)],
      diagnostics: [],
    });
    const normalized = String(out.body);
    // The normalized form parses back to the same value tree.
    expect(dataOf(normalized)).toEqual({ port: 8080, server: { host: 'localhost' } });
    expect(normalized).toContain('[server]');
  });

  it('toml.export.markdown.summary describes shape + diagnostics', () => {
    const parsed = parseText(['[a]', 'b = 1', 'b = 2'].join('\n'));
    const out = runExporter(registry(), 'toml', 'toml.export.markdown.summary', {
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
    });
    const body = String(out.body);
    expect(body).toContain('# NekoTOML export');
    expect(body).toContain('tables: 1');
    expect(body).toContain('toml.duplicate_key');
  });

  it('the exporter refuses a foreign artifact kind (runtime enforces accepts)', () => {
    const foreign = { ...parsedOf('a = 1'), kind: 'json.value' } as unknown as Artifact;
    for (const id of ['toml.export.json', 'toml.export.normalized', 'toml.export.markdown.summary']) {
      expect(() =>
        runExporter(registry(), 'toml', id, { artifacts: [foreign], diagnostics: [] }),
      ).toThrow(/does not accept artifact kind/);
    }
  });
});

describe('NekoTOML: workspace round-trip', () => {
  it('a parsed-TOML workspace round-trips losslessly', () => {
    const parsed = parseText(['[server]', 'host = "localhost"', 'ports = [80, 443]'].join('\n'));
    const ws: Workspace = {
      version: 1,
      id: 'ws_toml_single',
      toolId: 'toml',
      toolVersion: 1,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { viewMode: 'tree' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
