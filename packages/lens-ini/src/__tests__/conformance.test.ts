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

import { FIXED_CLOCK, buildIniRegistration, iniManifest } from '../index.js';
import type { IniParsedArtifact } from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-28T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildIniRegistration(clock));
  return r;
}

function parse(raw: string) {
  return runParser(registry(), 'ini', 'ini.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function val(raw: string) {
  return (parse(raw).artifacts[0] as IniParsedArtifact).value;
}

describe('NekoINI: manifest', () => {
  it('passes schema + cross-field validation', () => {
    expect(validateManifest(iniManifest).ok).toBe(true);
  });
  it('declares network-forbidden offline policy', () => {
    expect(iniManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });
  it('free entitlements match the implemented slice', () => {
    expect(new Set(iniManifest.entitlements.free)).toEqual(
      new Set([
        'parse',
        'inspect.sections',
        'diagnostics.structure',
        'convert.json',
        'normalize.document',
        'export.json',
        'export.normalized',
        'export.markdown.summary',
        'copy.output',
        'workspace.save',
      ]),
    );
  });
});

describe('NekoINI: monetization safety', () => {
  const registration = buildIniRegistration(clock);
  const proExporterIds = ['ini.export.env', 'ini.export.toml'];
  it('no Pro exporter is registered, and each throws "unknown exporter"', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    const r = registry();
    for (const id of proExporterIds) {
      expect(registered.has(id)).toBe(false);
      expect(iniManifest.exporters).toContain(id);
      expect(() => runExporter(r, 'ini', id, { artifacts: [], diagnostics: [] })).toThrow(
        /unknown exporter/,
      );
    }
  });
});

describe('NekoINI: parser', () => {
  it('parses sections and key=value into a nested data object', () => {
    const v = val('[server]\nhost = localhost\nport = 8080\n\n[db]\nname = app');
    expect(v.sectionCount).toBe(2);
    expect(v.keyCount).toBe(3);
    expect(v.data).toEqual({ server: { host: 'localhost', port: '8080' }, db: { name: 'app' } });
  });

  it('places pre-section keys at the global top level', () => {
    const v = val('debug = true\n[server]\nhost = x');
    expect(v.data).toEqual({ debug: 'true', server: { host: 'x' } });
  });

  it('accepts colon as a delimiter (.properties style) and ; # ! comments', () => {
    const v = val('; a comment\n# another\n! third\nkey : value\nother=2');
    expect(v.data).toEqual({ key: 'value', other: '2' });
  });

  it('keeps values as raw strings (no type coercion)', () => {
    expect(val('n = 007\nb = true').data).toEqual({ n: '007', b: 'true' });
  });

  it('warns on a duplicate key and keeps the first value', () => {
    const result = parse('[s]\nk = 1\nk = 2');
    expect(result.diagnostics.find((d) => d.code === 'ini.duplicate_key')?.severity).toBe('warning');
    expect((result.artifacts[0] as IniParsedArtifact).value.data).toEqual({ s: { k: '1' } });
  });

  it('merges a repeated section and emits ini.duplicate_section (info)', () => {
    const result = parse('[s]\na = 1\n[s]\nb = 2');
    expect(result.diagnostics.find((d) => d.code === 'ini.duplicate_section')?.severity).toBe('info');
    expect((result.artifacts[0] as IniParsedArtifact).value.data).toEqual({ s: { a: '1', b: '2' } });
  });

  it('warns on a line that is neither a section nor key=value', () => {
    expect(parse('just some text').diagnostics.find((d) => d.code === 'ini.parse_error')?.severity).toBe(
      'warning',
    );
  });

  it('emits ini.empty_input for empty input', () => {
    expect(parse('   ').diagnostics.map((d) => d.code)).toContain('ini.empty_input');
  });

  it('produces a schema-valid artifact', () => {
    expect(validate('artifact', parse('[s]\nk=v').artifacts[0] as Artifact).ok).toBe(true);
  });
});

describe('NekoINI: exporters', () => {
  it('ini.export.json emits the nested data object', () => {
    const out = runExporter(registry(), 'ini', 'ini.export.json', {
      artifacts: parse('[s]\nk = v').artifacts,
      diagnostics: [],
    });
    expect(JSON.parse(String(out.body))).toEqual({ s: { k: 'v' } });
  });

  it('ini.export.normalized re-serializes (global first, then sections; round-trips)', () => {
    const src = 'debug = true\n[server]\nhost = localhost';
    const out = runExporter(registry(), 'ini', 'ini.export.normalized', {
      artifacts: parse(src).artifacts,
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toContain('debug=true');
    expect(body).toContain('[server]');
    expect(val(body).data).toEqual({ debug: 'true', server: { host: 'localhost' } });
  });

  it('ini.export.markdown.summary lists sections + counts', () => {
    const out = runExporter(registry(), 'ini', 'ini.export.markdown.summary', {
      artifacts: parse('[s]\nk = v').artifacts,
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toContain('# NekoINI export');
    expect(body).toContain('sections: 1');
  });

  it('refuses a foreign artifact kind', () => {
    const foreign = { ...(parse('[s]\nk=v').artifacts[0] as Artifact), kind: 'json.value' } as Artifact;
    expect(() =>
      runExporter(registry(), 'ini', 'ini.export.json', { artifacts: [foreign], diagnostics: [] }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoINI: workspace round-trip', () => {
  it('round-trips losslessly', () => {
    const parsed = parse('[server]\nhost = localhost\nport = 8080');
    const ws: Workspace = {
      version: 1,
      id: 'ws_ini_single',
      toolId: 'ini',
      toolVersion: 1,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { viewMode: 'sections' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
