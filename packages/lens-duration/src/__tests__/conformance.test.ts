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

import { FIXED_CLOCK, buildDurationRegistration, durationManifest, parseDuration } from '../index.js';
import type { DurationParsedArtifact } from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-28T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildDurationRegistration(clock));
  return r;
}

function parse(raw: string) {
  return runParser(registry(), 'duration', 'duration.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function one(raw: string) {
  return (parse(raw).artifacts[0] as DurationParsedArtifact).value.entries[0]!;
}

describe('NekoDuration: manifest', () => {
  it('passes schema + cross-field validation', () => {
    expect(validateManifest(durationManifest).ok).toBe(true);
  });
  it('declares network-forbidden offline policy', () => {
    expect(durationManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });
  it('free entitlements match the implemented slice', () => {
    expect(new Set(durationManifest.entitlements.free)).toEqual(
      new Set([
        'parse.iso',
        'parse.humanized',
        'convert.seconds',
        'normalize.iso',
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

describe('NekoDuration: monetization safety', () => {
  const registration = buildDurationRegistration(clock);
  const proExporterIds = ['duration.export.breakdown.csv', 'duration.export.locale'];
  it('no Pro exporter is registered, and each throws "unknown exporter"', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    const r = registry();
    for (const id of proExporterIds) {
      expect(registered.has(id)).toBe(false);
      expect(durationManifest.exporters).toContain(id);
      expect(() => runExporter(r, 'duration', id, { artifacts: [], diagnostics: [] })).toThrow(
        /unknown exporter/,
      );
    }
  });
});

describe('NekoDuration: parsing', () => {
  it('parses ISO-8601 (PT1H30M) to total seconds', () => {
    const v = one('PT1H30M').value!;
    expect(v.source).toBe('iso');
    expect(v.totalSeconds).toBe(5400);
    expect(v.human).toBe('1h 30m');
  });

  it('parses a day + time ISO duration', () => {
    expect(one('P1DT2H').value!.totalSeconds).toBe(93600);
  });

  it('parses humanized "1h30m" and "90 min"', () => {
    expect(one('1h30m').value!.totalSeconds).toBe(5400);
    expect(one('90 min').value!.totalSeconds).toBe(5400);
  });

  it('parses bare seconds', () => {
    const v = one('3600').value!;
    expect(v.source).toBe('seconds');
    expect(v.iso).toBe('PT1H');
  });

  it('normalizes to canonical ISO (90 min → PT1H30M)', () => {
    expect(one('90m').value!.iso).toBe('PT1H30M');
    expect(one('PT90M').value!.iso).toBe('PT1H30M');
  });

  it('flags years/months as approximate', () => {
    const result = parse('P1Y');
    expect(result.diagnostics.find((d) => d.code === 'duration.approximate')?.severity).toBe('info');
    expect((result.artifacts[0] as DurationParsedArtifact).value.entries[0]!.value!.approximate).toBe(true);
  });

  it('handles fractional values', () => {
    expect(one('1.5h').value!.totalSeconds).toBe(5400);
  });

  it('rejects nonsense input with duration.parse_error', () => {
    expect(parse('hello world').diagnostics.find((d) => d.code === 'duration.parse_error')?.severity).toBe(
      'warning',
    );
    expect(one('1 banana').valid).toBe(false);
  });

  it('parseDuration is callable directly', () => {
    expect(parseDuration('PT2H')!.totalSeconds).toBe(7200);
    expect(parseDuration('nope')).toBeNull();
  });

  it('emits duration.empty_input for empty input', () => {
    expect(parse('   ').diagnostics.map((d) => d.code)).toContain('duration.empty_input');
  });

  it('produces a schema-valid artifact', () => {
    expect(validate('artifact', parse('PT1H').artifacts[0] as Artifact).ok).toBe(true);
  });
});

describe('NekoDuration: exporters', () => {
  it('duration.export.normalized emits canonical ISO per line', () => {
    const out = runExporter(registry(), 'duration', 'duration.export.normalized', {
      artifacts: parse('90m\n3600').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toBe('PT1H30M\nPT1H');
  });
  it('duration.export.markdown.summary tabulates entries', () => {
    const out = runExporter(registry(), 'duration', 'duration.export.markdown.summary', {
      artifacts: parse('PT1H30M').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toContain('# NekoDuration export');
    expect(String(out.body)).toContain('5400');
  });
  it('refuses a foreign artifact kind', () => {
    const foreign = { ...(parse('PT1H').artifacts[0] as Artifact), kind: 'json.value' } as Artifact;
    expect(() =>
      runExporter(registry(), 'duration', 'duration.export.json', { artifacts: [foreign], diagnostics: [] }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoDuration: workspace round-trip', () => {
  it('round-trips losslessly', () => {
    const parsed = parse('PT1H30M\n2d');
    const ws: Workspace = {
      version: 1,
      id: 'ws_duration_single',
      toolId: 'duration',
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
