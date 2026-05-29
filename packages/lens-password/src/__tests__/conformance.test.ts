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

import { FIXED_CLOCK, assessPassword, buildPasswordRegistration, passwordManifest } from '../index.js';
import type { PasswordReportArtifact } from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-28T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildPasswordRegistration(clock));
  return r;
}

function parse(raw: string) {
  return runParser(registry(), 'password', 'password.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function report(raw: string) {
  return (parse(raw).artifacts[0] as PasswordReportArtifact).value;
}

describe('NekoPassword: manifest', () => {
  it('passes schema + cross-field validation', () => {
    expect(validateManifest(passwordManifest).ok).toBe(true);
  });
  it('declares network-forbidden offline policy', () => {
    expect(passwordManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });
  it('free entitlements match the implemented slice', () => {
    expect(new Set(passwordManifest.entitlements.free)).toEqual(
      new Set([
        'assess',
        'inspect.entropy',
        'estimate.crack-time',
        'detect.patterns',
        'diagnostics.strength',
        'export.json',
        'export.crack-times',
        'export.markdown.summary',
        'copy.output',
        'workspace.save',
      ]),
    );
  });
});

describe('NekoPassword: monetization safety', () => {
  const registration = buildPasswordRegistration(clock);
  const proExporterIds = ['password.export.policy.report', 'password.export.audit.csv'];
  it('no Pro exporter is registered, and each throws "unknown exporter"', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    const r = registry();
    for (const id of proExporterIds) {
      expect(registered.has(id)).toBe(false);
      expect(passwordManifest.exporters).toContain(id);
      expect(() => runExporter(r, 'password', id, { artifacts: [], diagnostics: [] })).toThrow(
        /unknown exporter/,
      );
    }
  });
});

describe('NekoPassword: privacy (the password is never stored)', () => {
  it('the artifact + every export are free of the raw password', () => {
    const secret = 'Hunter2-Tr0ub4dour-xyz';
    const result = parse(secret);
    expect(JSON.stringify(result.artifacts[0])).not.toContain(secret);
    for (const id of ['password.export.json', 'password.export.crack-times', 'password.export.markdown.summary']) {
      const out = runExporter(registry(), 'password', id, {
        artifacts: result.artifacts,
        diagnostics: result.diagnostics,
      });
      expect(String(out.body)).not.toContain(secret);
    }
  });
});

describe('NekoPassword: scoring', () => {
  it('flags a common password as very weak (score 0)', () => {
    const v = report('password');
    expect(v.score).toBe(0);
    expect(v.warnings.some((w) => /commonly used/i.test(w))).toBe(true);
  });

  it('flags a sequence / keyboard walk', () => {
    expect(report('abcdefgh').warnings.some((w) => /sequence/i.test(w))).toBe(true);
    expect(report('qwertyuiop').warnings.some((w) => /keyboard/i.test(w))).toBe(true);
  });

  it('flags repeated characters', () => {
    expect(report('aaaaaaaa').warnings.some((w) => /repeated/i.test(w))).toBe(true);
  });

  it('rates a long random passphrase as strong (score 4)', () => {
    const v = report('correct horse battery staple xyzzy');
    expect(v.score).toBe(4);
    expect(v.entropyBits).toBeGreaterThan(128);
  });

  it('charClasses + pool reflect the character set', () => {
    const v = report('Ab1!');
    expect(v.charClasses).toMatchObject({ lower: true, upper: true, digit: true, symbol: true });
    expect(v.poolSize).toBe(26 + 26 + 10 + 33);
  });

  it('crack times include an offline fast-hash scenario with a display string', () => {
    const v = report('Tr0ub4dour&3xyz');
    const offline = v.crackTimes.find((t) => /offline, fast/i.test(t.scenario));
    expect(offline).toBeDefined();
    expect(typeof offline!.display).toBe('string');
  });

  it('assessPassword is callable directly (no clock needed)', () => {
    expect(assessPassword('').score).toBe(0);
    expect(assessPassword('').length).toBe(0);
  });
});

describe('NekoPassword: diagnostics', () => {
  it('emits password.empty_input for empty input', () => {
    expect(parse('').diagnostics.map((d) => d.code)).toContain('password.empty_input');
  });
  it('emits a password.assessment diagnostic (error severity for very weak)', () => {
    const diag = parse('123456').diagnostics.find((d) => d.code === 'password.assessment');
    expect(diag?.severity).toBe('error');
  });
  it('produces a schema-valid artifact', () => {
    expect(validate('artifact', parse('Abcd1234!').artifacts[0] as Artifact).ok).toBe(true);
  });
});

describe('NekoPassword: exporters', () => {
  it('password.export.json emits the metrics', () => {
    const out = runExporter(registry(), 'password', 'password.export.json', {
      artifacts: parse('Abcd1234!').artifacts,
      diagnostics: [],
    });
    expect(typeof JSON.parse(String(out.body)).entropyBits).toBe('number');
  });
  it('password.export.crack-times lists scenarios', () => {
    const out = runExporter(registry(), 'password', 'password.export.crack-times', {
      artifacts: parse('Abcd1234!').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toContain('Offline, fast hash');
  });
  it('refuses a foreign artifact kind', () => {
    const foreign = { ...(parse('x').artifacts[0] as Artifact), kind: 'json.value' } as Artifact;
    expect(() =>
      runExporter(registry(), 'password', 'password.export.json', { artifacts: [foreign], diagnostics: [] }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoPassword: workspace round-trip', () => {
  it('round-trips losslessly (metrics only)', () => {
    const parsed = parse('Abcd1234!extra');
    const ws: Workspace = {
      version: 1,
      id: 'ws_password_single',
      toolId: 'password',
      toolVersion: 1,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { masked: true },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
