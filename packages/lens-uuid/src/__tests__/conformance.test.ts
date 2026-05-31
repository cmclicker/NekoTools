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

import { FIXED_CLOCK, buildUuidRegistration, uuidManifest } from '../index.js';
import type { ParsedId, UuidParsedArtifact } from '../kinds.js';

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
  r.register(buildUuidRegistration(clock));
  return r;
}

function parse(raw: string) {
  return runParser(registry(), 'uuid', 'uuid.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function one(raw: string): ParsedId {
  return (parse(raw).artifacts[0] as UuidParsedArtifact).value.ids[0]!;
}

describe('NekoUUID: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(uuidManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy', () => {
    expect(uuidManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('free entitlements match exactly the implemented vertical-slice set', () => {
    expect(new Set(uuidManifest.entitlements.free)).toEqual(
      new Set([
        'parse.uuid',
        'parse.ulid',
        'inspect.version',
        'extract.timestamp',
        'diagnostics.format',
        'export.json',
        'export.normalized',
        'export.markdown.summary',
        'copy.output',
        'workspace.save',
      ]),
    );
  });
});

describe('NekoUUID: monetization gating (single-build, entitlement-gated)', () => {
  const registration = buildUuidRegistration(clock);
  const proExporterIds = ['uuid.export.namespace.report', 'uuid.export.bulk.csv'];

  it('Pro exporters are declared AND registered as proExporters, not free', () => {
    const proIds = new Set((registration.proExporters ?? []).map((e) => e.id));
    const free = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) {
      expect(uuidManifest.exporters).toContain(id);
      expect(proIds.has(id)).toBe(true);
      expect(free.has(id)).toBe(false);
    }
  });

  it('a free caller (default entitlement) is refused with EntitlementError', () => {
    const r = registry();
    const parsed = {
      artifacts: parse('550e8400-e29b-41d4-a716-446655440000').artifacts,
      diagnostics: [],
    };
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'uuid', id, parsed)).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the namespace report + bulk CSV exporters', () => {
    const r = registry();
    const parsed = {
      artifacts: parse('017F22E2-79B0-7CC3-98C4-DC0C0C07398F\nnot-a-uuid').artifacts,
      diagnostics: [],
    };

    const report = String(
      runExporter(r, 'uuid', 'uuid.export.namespace.report', parsed, PRO).body,
    );
    expect(report).toContain('# NekoUUID namespace report');
    expect(report).toContain('- identifiers: 2');
    expect(report).toContain('version: v7');
    expect(report).toContain('2022-02-22T19:22:22.000Z');
    expect(report).toContain('## Summary by version');

    const csv = String(runExporter(r, 'uuid', 'uuid.export.bulk.csv', parsed, PRO).body);
    expect(csv).toContain('input,valid,version,variant,normalized,timestamp,isNil,isMax');
    expect(csv).toContain('017f22e2-79b0-7cc3-98c4-dc0c0c07398f');
    expect(csv).toContain('2022-02-22T19:22:22.000Z');
  });

  it('a truly unknown exporter id still throws "unknown exporter"', () => {
    expect(() =>
      runExporter(registry(), 'uuid', 'uuid.export.nope', { artifacts: [], diagnostics: [] }, PRO),
    ).toThrow(/unknown exporter/);
  });
});

describe('NekoUUID: version + variant', () => {
  it('identifies a v4 UUID (RFC 4122 variant, no timestamp)', () => {
    const id = one('550e8400-e29b-41d4-a716-446655440000');
    expect(id).toMatchObject({ kind: 'uuid', valid: true, version: 4, variant: 'RFC 4122', timestamp: null });
  });

  it('identifies the nil UUID', () => {
    const id = one('00000000-0000-0000-0000-000000000000');
    expect(id.isNil).toBe(true);
    expect(id.version).toBeNull();
  });

  it('identifies the max UUID', () => {
    const id = one('ffffffff-ffff-ffff-ffff-ffffffffffff');
    expect(id.isMax).toBe(true);
  });

  it('accepts urn:uuid: and brace-wrapped forms, normalizing to lowercase dashed', () => {
    expect(one('urn:uuid:550E8400-E29B-41D4-A716-446655440000').normalized).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(one('{550e8400-e29b-41d4-a716-446655440000}').valid).toBe(true);
  });
});

// RFC 9562's example UUIDs all encode the same instant, documented there as
// "2022-02-22 14:22:22 GMT-05:00" — i.e. 19:22:22 UTC.
describe('NekoUUID: embedded timestamps (RFC 9562 vectors → 2022-02-22T19:22:22Z)', () => {
  it('extracts the v1 timestamp', () => {
    const id = one('C232AB00-9414-11EC-B3C8-9E6BDECED846');
    expect(id.version).toBe(1);
    expect(id.timestamp?.startsWith('2022-02-22T19:22:22')).toBe(true);
  });

  it('extracts the v6 timestamp', () => {
    const id = one('1EC9414C-232A-6B00-B3C8-9E6BDECED846');
    expect(id.version).toBe(6);
    expect(id.timestamp?.startsWith('2022-02-22T19:22:22')).toBe(true);
  });

  it('extracts the v7 unix-ms timestamp exactly', () => {
    const id = one('017F22E2-79B0-7CC3-98C4-DC0C0C07398F');
    expect(id.version).toBe(7);
    expect(id.timestamp).toBe('2022-02-22T19:22:22.000Z');
  });
});

describe('NekoUUID: ULID', () => {
  it('decodes the 48-bit timestamp positionally (all-zero → unix epoch)', () => {
    expect(one('00000000000000000000000000').timestamp).toBe('1970-01-01T00:00:00.000Z');
    // Last time-char is the least-significant 5 bits: value 1 → 1ms.
    expect(one('00000000010000000000000000').timestamp).toBe('1970-01-01T00:00:00.001Z');
  });

  it('parses the canonical ULID example', () => {
    const id = one('01ARZ3NDEKTSV4RRFFQ69G5FAV');
    expect(id.kind).toBe('ulid');
    expect(id.version).toBeNull();
    expect(id.normalized).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
    expect(id.timestamp?.startsWith('2016-')).toBe(true);
  });
});

describe('NekoUUID: diagnostics + multi-line', () => {
  it('emits uuid.empty_input for empty input', () => {
    expect(parse('   ').diagnostics.map((d) => d.code)).toContain('uuid.empty_input');
  });

  it('emits uuid.parse_error (warning) for an invalid line, keeping valid ids', () => {
    const result = parse('550e8400-e29b-41d4-a716-446655440000\nnot-a-uuid');
    const value = (result.artifacts[0] as UuidParsedArtifact).value;
    expect(value.count).toBe(2);
    expect(value.ids[0]!.valid).toBe(true);
    expect(value.ids[1]!.valid).toBe(false);
    expect(result.diagnostics.find((d) => d.code === 'uuid.parse_error')?.severity).toBe('warning');
  });

  it('produces a uuid.parsed artifact that validates against the artifact schema', () => {
    const validation = validate('artifact', parse('550e8400-e29b-41d4-a716-446655440000').artifacts[0] as Artifact);
    expect(validation.ok, validation.errors.join('; ')).toBe(true);
  });
});

describe('NekoUUID: exporters', () => {
  it('uuid.export.json emits the breakdown', () => {
    const out = runExporter(registry(), 'uuid', 'uuid.export.json', {
      artifacts: parse('017F22E2-79B0-7CC3-98C4-DC0C0C07398F').artifacts,
      diagnostics: [],
    });
    expect(JSON.parse(String(out.body)).ids[0].version).toBe(7);
  });

  it('uuid.export.normalized emits canonical forms, skipping invalid lines', () => {
    const out = runExporter(registry(), 'uuid', 'uuid.export.normalized', {
      artifacts: parse('550E8400-E29B-41D4-A716-446655440000\nnope').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('uuid.export.markdown.summary tabulates the ids', () => {
    const out = runExporter(registry(), 'uuid', 'uuid.export.markdown.summary', {
      artifacts: parse('550e8400-e29b-41d4-a716-446655440000').artifacts,
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toContain('# NekoUUID export');
    expect(body).toContain('v4');
  });

  it('the exporter refuses a foreign artifact kind', () => {
    const foreign = {
      ...(parse('550e8400-e29b-41d4-a716-446655440000').artifacts[0] as Artifact),
      kind: 'json.value',
    } as Artifact;
    for (const id of ['uuid.export.json', 'uuid.export.normalized', 'uuid.export.markdown.summary']) {
      expect(() =>
        runExporter(registry(), 'uuid', id, { artifacts: [foreign], diagnostics: [] }),
      ).toThrow(/does not accept artifact kind/);
    }
  });
});

describe('NekoUUID: workspace round-trip', () => {
  it('a parsed-id workspace round-trips losslessly', () => {
    const parsed = parse('017F22E2-79B0-7CC3-98C4-DC0C0C07398F\n01ARZ3NDEKTSV4RRFFQ69G5FAV');
    const ws: Workspace = {
      version: 1,
      id: 'ws_uuid_single',
      toolId: 'uuid',
      toolVersion: 1,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { viewMode: 'table' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
