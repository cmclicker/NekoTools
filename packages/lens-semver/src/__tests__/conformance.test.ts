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

import {
  FIXED_CLOCK,
  buildSemverRegistration,
  compareSemver,
  parseSemver,
  satisfies,
  semverManifest,
} from '../index.js';
import type { SemverParsedArtifact } from '../kinds.js';

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
  r.register(buildSemverRegistration(clock));
  return r;
}

function parse(raw: string, range?: string) {
  return runParser(registry(), 'semver', 'semver.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
    ...(range ? { hints: { range } } : {}),
  });
}

function report(raw: string, range?: string) {
  return (parse(raw, range).artifacts[0] as SemverParsedArtifact).value;
}

// A small helper: does `v` satisfy `range`?
function sat(v: string, range: string): boolean | null {
  return satisfies(parseSemver(v)!, range);
}

describe('NekoSemver: manifest', () => {
  it('passes schema + cross-field validation', () => {
    expect(validateManifest(semverManifest).ok).toBe(true);
  });
  it('declares network-forbidden offline policy', () => {
    expect(semverManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });
  it('free entitlements match the implemented slice', () => {
    expect(new Set(semverManifest.entitlements.free)).toEqual(
      new Set([
        'parse',
        'inspect.components',
        'compare.sort',
        'range.satisfies',
        'diagnostics.format',
        'export.json',
        'export.sorted',
        'export.markdown.summary',
        'copy.output',
        'workspace.save',
      ]),
    );
  });
});

describe('NekoSemver: monetization gating (single-build, entitlement-gated)', () => {
  const registration = buildSemverRegistration(clock);
  const proExporterIds = ['semver.export.range.report', 'semver.export.bump.plan'];

  it('Pro exporters are declared AND registered as proExporters, not free', () => {
    const proIds = new Set((registration.proExporters ?? []).map((e) => e.id));
    const free = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) {
      expect(semverManifest.exporters).toContain(id);
      expect(proIds.has(id)).toBe(true);
      expect(free.has(id)).toBe(false);
    }
  });

  it('a free caller (default entitlement) is refused with EntitlementError', () => {
    const r = registry();
    const parsed = parse('1.2.0\n2.0.0', '^1.0.0');
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'semver', id, parsed)).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the range report + bump plan exporters', () => {
    const r = registry();
    const parsed = parse('1.2.0\n2.0.0', '^1.0.0');

    const reportMd = String(runExporter(r, 'semver', 'semver.export.range.report', parsed, PRO).body);
    expect(reportMd).toContain('# NekoSemver range report');
    expect(reportMd).toContain('range: `^1.0.0`');
    expect(reportMd).toContain('| 1.2.0 | yes |');
    expect(reportMd).toContain('| 2.0.0 | no |');

    const planMd = String(
      runExporter(r, 'semver', 'semver.export.bump.plan', parse('1.2.3'), PRO).body,
    );
    expect(planMd).toContain('# NekoSemver bump plan');
    expect(planMd).toContain('base version: `1.2.3`');
    expect(planMd).toContain('| major | 2.0.0 |');
    expect(planMd).toContain('| minor | 1.3.0 |');
    expect(planMd).toContain('| patch | 1.2.4 |');
  });

  it('a truly unknown exporter id still throws "unknown exporter"', () => {
    expect(() =>
      runExporter(registry(), 'semver', 'semver.export.nope', { artifacts: [], diagnostics: [] }, PRO),
    ).toThrow(/unknown exporter/);
  });
});

describe('NekoSemver: parse + components', () => {
  it('parses version components incl. prerelease + build', () => {
    const c = report('1.2.3-alpha.1+build.5').versions[0]!.components!;
    expect(c).toEqual({ major: 1, minor: 2, patch: 3, prerelease: 'alpha.1', build: 'build.5' });
  });

  it('accepts a leading v and normalizes it away', () => {
    expect(report('v2.0.0').versions[0]!.version).toBe('2.0.0');
  });

  it('flags an invalid version (semver.parse_error, warning)', () => {
    const result = parse('1.2');
    expect(result.diagnostics.find((d) => d.code === 'semver.parse_error')?.severity).toBe('warning');
    expect((result.artifacts[0] as SemverParsedArtifact).value.versions[0]!.valid).toBe(false);
  });
});

describe('NekoSemver: precedence (spec §11)', () => {
  it('orders by major/minor/patch then prerelease', () => {
    expect(compareSemver(parseSemver('1.0.0')!, parseSemver('2.0.0')!)).toBe(-1);
    expect(compareSemver(parseSemver('1.0.0-alpha')!, parseSemver('1.0.0')!)).toBe(-1);
    expect(compareSemver(parseSemver('1.0.0-alpha.1')!, parseSemver('1.0.0-alpha.beta')!)).toBe(-1);
    expect(compareSemver(parseSemver('1.0.0+a')!, parseSemver('1.0.0+b')!)).toBe(0); // build ignored
  });

  it('sorts a list ascending', () => {
    expect(report('2.0.0\n1.0.0\n1.0.0-rc.1\n1.2.0').sortedAscending).toEqual([
      '1.0.0-rc.1',
      '1.0.0',
      '1.2.0',
      '2.0.0',
    ]);
  });
});

describe('NekoSemver: range satisfies', () => {
  it('caret ranges', () => {
    expect(sat('1.2.3', '^1.2.0')).toBe(true);
    expect(sat('1.9.9', '^1.2.0')).toBe(true);
    expect(sat('2.0.0', '^1.2.0')).toBe(false);
    expect(sat('0.2.5', '^0.2.3')).toBe(true);
    expect(sat('0.3.0', '^0.2.3')).toBe(false);
  });

  it('tilde ranges', () => {
    expect(sat('1.2.9', '~1.2.3')).toBe(true);
    expect(sat('1.3.0', '~1.2.3')).toBe(false);
  });

  it('comparators, x-ranges, hyphen, and ||', () => {
    expect(sat('1.5.0', '>=1.2.3 <2.0.0')).toBe(true);
    expect(sat('1.2.9', '1.2.x')).toBe(true);
    expect(sat('1.3.0', '1.2.x')).toBe(false);
    expect(sat('2.3.0', '1.2.3 - 2.3.4')).toBe(true);
    expect(sat('2.4.0', '1.2.3 - 2.3.4')).toBe(false);
    expect(sat('3.0.0', '^1.0.0 || ^3.0.0')).toBe(true);
    expect(sat('1.0.0', '*')).toBe(true);
  });

  it('prerelease gate: a prerelease only matches a same-tuple prerelease comparator', () => {
    expect(sat('1.2.3-beta', '^1.2.3-alpha')).toBe(true);
    expect(sat('1.2.3-beta', '^1.0.0')).toBe(false);
    expect(sat('1.2.4', '^1.2.3-alpha')).toBe(true);
  });

  it('marks satisfies per version when a range hint is supplied', () => {
    const versions = report('1.2.0\n2.0.0', '^1.0.0').versions;
    expect(versions[0]!.satisfies).toBe(true);
    expect(versions[1]!.satisfies).toBe(false);
  });

  it('emits semver.range_error for an unparseable range', () => {
    expect(parse('1.0.0', '>>broken').diagnostics.map((d) => d.code)).toContain('semver.range_error');
  });
});

describe('NekoSemver: diagnostics + artifact', () => {
  it('emits semver.empty_input for empty input', () => {
    expect(parse('   ').diagnostics.map((d) => d.code)).toContain('semver.empty_input');
  });
  it('produces a schema-valid artifact', () => {
    expect(validate('artifact', parse('1.2.3').artifacts[0] as Artifact).ok).toBe(true);
  });
});

describe('NekoSemver: exporters', () => {
  it('semver.export.sorted lists ascending versions', () => {
    const out = runExporter(registry(), 'semver', 'semver.export.sorted', {
      artifacts: parse('2.0.0\n1.0.0').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toBe('1.0.0\n2.0.0');
  });
  it('semver.export.json round-trips the report', () => {
    const out = runExporter(registry(), 'semver', 'semver.export.json', {
      artifacts: parse('1.2.3').artifacts,
      diagnostics: [],
    });
    expect(JSON.parse(String(out.body)).versions[0].version).toBe('1.2.3');
  });
  it('refuses a foreign artifact kind', () => {
    const foreign = { ...(parse('1.2.3').artifacts[0] as Artifact), kind: 'json.value' } as Artifact;
    expect(() =>
      runExporter(registry(), 'semver', 'semver.export.json', { artifacts: [foreign], diagnostics: [] }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoSemver: workspace round-trip', () => {
  it('round-trips losslessly', () => {
    const parsed = parse('1.2.0\n2.0.0', '^1.0.0');
    const ws: Workspace = {
      version: 1,
      id: 'ws_semver_single',
      toolId: 'semver',
      toolVersion: 1,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { range: '^1.0.0' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
