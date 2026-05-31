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

import { FIXED_CLOCK, buildDurationRegistration, durationManifest, parseDuration } from '../index.js';
import type { DurationParsedArtifact } from '../kinds.js';

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

describe('NekoDuration: monetization gating (single-build, entitlement-gated)', () => {
  const registration = buildDurationRegistration(clock);
  // Both declared Pro ids are now built + gated (locale uses host Intl only).
  const builtProIds = ['duration.export.breakdown.csv', 'duration.export.locale'];

  it('both Pro exporters are declared AND registered as proExporters, not free', () => {
    const free = new Set(registration.exporters.map((e) => e.id));
    const pro = new Set((registration.proExporters ?? []).map((e) => e.id));
    for (const id of builtProIds) {
      expect(durationManifest.exporters).toContain(id);
      expect(pro.has(id)).toBe(true);
      expect(free.has(id)).toBe(false);
    }
  });

  it('a free caller (default entitlement) is refused both Pro exporters with EntitlementError', () => {
    const r = registry();
    const parsed = parse('PT1H30M\n90s');
    for (const id of builtProIds) {
      expect(() => runExporter(r, 'duration', id, parsed)).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the breakdown CSV exporter', () => {
    const r = registry();
    const parsed = parse('PT1H30M\n90s');
    const csv = String(runExporter(r, 'duration', 'duration.export.breakdown.csv', parsed, PRO).body);
    expect(csv.split('\n')[0]).toBe('input,totalSeconds,days,hours,minutes,seconds,iso,approximate');
    // PT1H30M = 5400s → 0d 1h 30m 0s.
    expect(csv).toContain('PT1H30M,5400,0,1,30,0,');
  });

  it('a Pro entitlement unlocks the locale exporter (host Intl, ICU-stable structure)', () => {
    const r = registry();
    const parsed = parse('PT1H30M');
    const md = String(runExporter(r, 'duration', 'duration.export.locale', parsed, PRO).body);
    expect(md).toContain('# NekoDuration locale formatting');
    expect(md).toContain('| locale | formatted |');
    // Assert the locale tags + structure (ICU-stable), not exact localized text
    // which varies by ICU/Node version.
    expect(md).toContain('| en |');
    expect(md).toContain('| ja |');
  });

  it('a truly unknown exporter id still throws "unknown exporter"', () => {
    expect(() =>
      runExporter(registry(), 'duration', 'duration.export.nope', { artifacts: [], diagnostics: [] }, PRO),
    ).toThrow(/unknown exporter/);
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
