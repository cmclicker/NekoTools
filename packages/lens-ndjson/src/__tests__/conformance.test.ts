import { describe, expect, it } from 'vitest';
import type { Artifact, Entitlement, Workspace } from '@nekotools/contracts';
import {
  EntitlementError,
  ToolRegistry,
  jsonWorkspaceSerializer,
  runExporter,
  runParser,
  validateManifest,
} from '@nekotools/tool-runtime';
import { validate } from '@nekotools/schemas';

import { FIXED_CLOCK, buildNdjsonRegistration, ndjsonManifest } from '../index.js';
import type { NdjsonParsedArtifact } from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-28T00:00:00.000Z');

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
  r.register(buildNdjsonRegistration(clock));
  return r;
}

function parse(raw: string) {
  return runParser(registry(), 'ndjson', 'ndjson.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function report(raw: string) {
  return (parse(raw).artifacts[0] as NdjsonParsedArtifact).value;
}

describe('NekoNDJSON: manifest', () => {
  it('passes schema + cross-field validation', () => {
    expect(validateManifest(ndjsonManifest).ok).toBe(true);
  });
  it('declares network-forbidden offline policy', () => {
    expect(ndjsonManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });
  it('free entitlements match the implemented slice', () => {
    expect(new Set(ndjsonManifest.entitlements.free)).toEqual(
      new Set([
        'parse',
        'inspect.records',
        'infer.shape',
        'diagnostics.lines',
        'convert.json-array',
        'export.json',
        'export.ndjson',
        'export.markdown.summary',
        'copy.output',
        'workspace.save',
      ]),
    );
  });
});

describe('NekoNDJSON: monetization gating (single-build, entitlement-gated)', () => {
  const registration = buildNdjsonRegistration(clock);
  const proExporterIds = ['ndjson.export.schema.json', 'ndjson.export.csv'];

  it('Pro exporters are declared AND registered as proExporters, not free', () => {
    const proIds = new Set((registration.proExporters ?? []).map((e) => e.id));
    const free = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) {
      expect(ndjsonManifest.exporters).toContain(id);
      expect(proIds.has(id)).toBe(true);
      expect(free.has(id)).toBe(false);
    }
  });

  it('a free caller (default entitlement) is refused with EntitlementError', () => {
    const r = registry();
    const parsed = parse('{"id":1,"name":"a"}\n{"id":2}');
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'ndjson', id, parsed)).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the JSON Schema + CSV exporters', () => {
    const r = registry();
    const parsed = parse('{"id":1,"name":"a"}\n{"id":2}');

    const schema = JSON.parse(
      String(runExporter(r, 'ndjson', 'ndjson.export.schema.json', parsed, PRO).body),
    ) as { type?: string; properties?: Record<string, { type?: string | string[] }>; required?: string[] };
    expect(schema.type).toBe('object');
    expect(schema.properties?.['id']?.type).toBe('number');
    expect(schema.required).toEqual(['id']); // name is optional (absent from record 2)

    const csv = String(runExporter(r, 'ndjson', 'ndjson.export.csv', parsed, PRO).body);
    expect(csv.split('\n')[0]).toBe('id,name');
    expect(csv).toContain('1,a');
    expect(csv).toContain('2,');
  });

  it('a truly unknown exporter id still throws "unknown exporter"', () => {
    expect(() =>
      runExporter(registry(), 'ndjson', 'ndjson.export.nope', { artifacts: [], diagnostics: [] }, PRO),
    ).toThrow(/unknown exporter/);
  });
});

describe('NekoNDJSON: parser', () => {
  it('parses each line into a record', () => {
    const v = report('{"a":1}\n{"a":2}\n[1,2,3]');
    expect(v.count).toBe(3);
    expect(v.validCount).toBe(3);
    expect(v.records[0]).toMatchObject({ line: 1, valid: true, type: 'object' });
    expect(v.records[2]).toMatchObject({ line: 3, valid: true, type: 'array' });
  });

  it('isolates a bad line: others still parse, with a line-numbered warning', () => {
    const result = parse('{"a":1}\n{bad}\n{"a":3}');
    const v = result.artifacts[0] as NdjsonParsedArtifact;
    expect(v.value.validCount).toBe(2);
    expect(v.value.invalidCount).toBe(1);
    expect(v.value.records[1]).toMatchObject({ line: 2, valid: false });
    const diag = result.diagnostics.find((d) => d.code === 'ndjson.parse_error');
    expect(diag?.severity).toBe('warning');
    expect(diag?.message).toContain('line 2');
  });

  it('skips blank lines (they are not records)', () => {
    expect(report('{"a":1}\n\n\n{"a":2}\n').count).toBe(2);
  });

  it('infers the field shape across homogeneous object records', () => {
    const v = report('{"id":1,"name":"a"}\n{"id":2}\n{"id":3,"name":"c","extra":true}');
    expect(v.homogeneousObjects).toBe(true);
    const byKey = Object.fromEntries(v.fields.map((f) => [f.key, f]));
    expect(byKey.id).toMatchObject({ types: ['number'], optional: false });
    expect(byKey.name).toMatchObject({ optional: true });
    expect(byKey.extra).toMatchObject({ types: ['boolean'], optional: true });
  });

  it('records a union of types for a key across records', () => {
    const v = report('{"x":1}\n{"x":"two"}');
    expect(v.fields.find((f) => f.key === 'x')!.types).toEqual(['number', 'string']);
  });

  it('emits ndjson.mixed_shape (info) when records are not all objects', () => {
    expect(parse('{"a":1}\n42').diagnostics.map((d) => d.code)).toContain('ndjson.mixed_shape');
    expect(report('{"a":1}\n42').fields).toHaveLength(0);
  });

  it('emits ndjson.empty_input for empty input', () => {
    expect(parse('   ').diagnostics.map((d) => d.code)).toContain('ndjson.empty_input');
  });

  it('produces a schema-valid artifact', () => {
    expect(validate('artifact', parse('{"a":1}').artifacts[0] as Artifact).ok).toBe(true);
  });
});

describe('NekoNDJSON: exporters', () => {
  it('ndjson.export.json emits the valid records as a JSON array', () => {
    const out = runExporter(registry(), 'ndjson', 'ndjson.export.json', {
      artifacts: parse('{"a":1}\n{bad}\n{"a":2}').artifacts,
      diagnostics: [],
    });
    expect(JSON.parse(String(out.body))).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('ndjson.export.ndjson re-serializes valid records compactly, one per line', () => {
    const out = runExporter(registry(), 'ndjson', 'ndjson.export.ndjson', {
      artifacts: parse('{ "a" : 1 }\n{ "b" : 2 }').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toBe('{"a":1}\n{"b":2}');
  });

  it('ndjson.export.markdown.summary reports counts + shape', () => {
    const out = runExporter(registry(), 'ndjson', 'ndjson.export.markdown.summary', {
      artifacts: parse('{"id":1}\n{"id":2}').artifacts,
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toContain('# NekoNDJSON export');
    expect(body).toContain('Inferred shape');
    expect(body).toContain('`id`');
  });

  it('refuses a foreign artifact kind', () => {
    const foreign = { ...(parse('{"a":1}').artifacts[0] as Artifact), kind: 'json.value' } as Artifact;
    expect(() =>
      runExporter(registry(), 'ndjson', 'ndjson.export.json', { artifacts: [foreign], diagnostics: [] }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoNDJSON: workspace round-trip', () => {
  it('round-trips losslessly', () => {
    const parsed = parse('{"a":1}\n{"a":2}');
    const ws: Workspace = {
      version: 1,
      id: 'ws_ndjson_single',
      toolId: 'ndjson',
      toolVersion: 1,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { viewMode: 'records' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
