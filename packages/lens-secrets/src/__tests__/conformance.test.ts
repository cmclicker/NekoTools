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

import { EntitlementError } from '@nekotools/tool-runtime';
import type { Entitlement } from '@nekotools/contracts';

import { FIXED_CLOCK, buildSecretsRegistration, secretsManifest } from '../index.js';
import type { SecretReportArtifact } from '../kinds.js';

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
  r.register(buildSecretsRegistration(clock));
  return r;
}

function scan(raw: string) {
  return runParser(registry(), 'secrets', 'secret.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function report(raw: string) {
  return (scan(raw).artifacts[0] as SecretReportArtifact).value;
}

function ruleIds(raw: string): string[] {
  return report(raw).findings.map((f) => f.ruleId);
}

describe('NekoSecrets: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(secretsManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy', () => {
    expect(secretsManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('free entitlements match exactly the implemented vertical-slice set', () => {
    expect(new Set(secretsManifest.entitlements.free)).toEqual(
      new Set([
        'scan.patterns',
        'scan.entropy',
        'inspect.findings',
        'diagnostics.security',
        'mask.findings',
        'export.json',
        'export.csv',
        'export.markdown.summary',
        'copy.output',
        'workspace.save',
      ]),
    );
  });
});

describe('NekoSecrets: monetization gating (single-build, entitlement-gated)', () => {
  const proExporterIds = [
    'secret.export.sarif',
    'secret.export.redacted',
    'secret.export.html',
    'secret.export.baseline',
  ];

  it('Pro exporters are declared AND registered as proExporters', () => {
    const reg = buildSecretsRegistration(clock);
    const proIds = new Set((reg.proExporters ?? []).map((e) => e.id));
    for (const id of proExporterIds) {
      expect(secretsManifest.exporters).toContain(id);
      expect(proIds.has(id)).toBe(true);
      // ...and NOT among the free exporters.
      expect(reg.exporters.some((e) => e.id === id)).toBe(false);
    }
  });

  it('a free caller (default entitlement) is refused with EntitlementError', () => {
    const r = registry();
    const parsed = scan('k=AKIAIOSFODNN7EXAMPLE');
    for (const id of proExporterIds) {
      expect(() =>
        runExporter(r, 'secrets', id, { artifacts: parsed.artifacts, diagnostics: [] }),
      ).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the SARIF + redacted exporters', () => {
    const r = registry();
    const parsed = scan('aws=AKIAIOSFODNN7EXAMPLE');
    const sarif = JSON.parse(
      String(runExporter(r, 'secrets', 'secret.export.sarif', { artifacts: parsed.artifacts, diagnostics: [] }, PRO).body),
    );
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].results[0].ruleId).toBe('aws.access-key');

    const redacted = String(
      runExporter(r, 'secrets', 'secret.export.redacted', { artifacts: parsed.artifacts, diagnostics: [] }, PRO).body,
    );
    expect(redacted).toContain('[REDACTED:aws.access-key]');
    expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('a truly unknown exporter id still throws "unknown exporter"', () => {
    expect(() =>
      runExporter(registry(), 'secrets', 'secret.export.nope', { artifacts: [], diagnostics: [] }, PRO),
    ).toThrow(/unknown exporter/);
  });

  it('the Pro HTML report is self-contained, masked, and leaks no raw secret', () => {
    const r = registry();
    const parsed = scan('aws=AKIAIOSFODNN7EXAMPLE');
    const html = String(
      runExporter(r, 'secrets', 'secret.export.html', { artifacts: parsed.artifacts, diagnostics: [] }, PRO).body,
    );
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('aws.access-key');
    expect(html).not.toContain('AKIAIOSFODNN7EXAMPLE'); // masked
    expect(html).not.toContain('http://'); // no remote assets
    expect(html).not.toContain('https://');
  });

  it('the Pro baseline emits sorted, deterministic fingerprints', () => {
    const r = registry();
    const parsed = scan('aws=AKIAIOSFODNN7EXAMPLE\ntoken=ghp_' + 'a'.repeat(36));
    const run = () =>
      String(
        runExporter(r, 'secrets', 'secret.export.baseline', { artifacts: parsed.artifacts, diagnostics: [] }, PRO).body,
      );
    const baseline = JSON.parse(run());
    expect(baseline.tool).toBe('NekoSecrets');
    expect(Array.isArray(baseline.fingerprints)).toBe(true);
    expect(baseline.fingerprints.length).toBe(2);
    expect([...baseline.fingerprints]).toEqual([...baseline.fingerprints].sort());
    // No raw secret in the fingerprints.
    expect(run()).not.toContain('AKIAIOSFODNN7EXAMPLE');
    // Deterministic across runs (commit-friendly).
    expect(run()).toBe(run());
  });
});

describe('NekoSecrets: scanner', () => {
  it('detects an AWS access key id', () => {
    expect(ruleIds('aws_key = AKIAIOSFODNN7EXAMPLE')).toContain('aws.access-key');
  });

  it('detects a GitHub token', () => {
    expect(ruleIds(`token: ghp_${'a'.repeat(36)}`)).toContain('github.token');
  });

  it('detects a Stripe live key as high and a test key as medium', () => {
    const live = report(`k=sk_live_${'a'.repeat(24)}`).findings.find((f) => f.ruleId === 'stripe.secret-live');
    const test = report(`k=sk_test_${'a'.repeat(24)}`).findings.find((f) => f.ruleId === 'stripe.secret-test');
    expect(live?.severity).toBe('high');
    expect(test?.severity).toBe('medium');
  });

  it('detects a PEM private key block', () => {
    expect(ruleIds('-----BEGIN RSA PRIVATE KEY-----\nMIIE...')).toContain('private.key');
  });

  it('detects a generic hardcoded secret assignment (value only)', () => {
    const f = report('password = "hunter2hunter2"').findings.find((x) => x.ruleId === 'generic.assignment');
    expect(f).toBeDefined();
    expect(f!.length).toBe('hunter2hunter2'.length);
  });

  it('flags a high-entropy token via the entropy fallback', () => {
    // A random-looking 40-char base64 string, not matching any provider rule.
    const ids = ruleIds('blob = Zk7Q9pX2vL4mN8rT1yB6cF3hJ0dK5sW7aE2gU9iO');
    expect(ids).toContain('entropy.high');
  });

  it('does NOT flag ordinary prose / low-entropy text', () => {
    expect(report('the quick brown fox jumps over the lazy dog').findingCount).toBe(0);
  });

  it('masks the secret — the raw value never appears in the artifact', () => {
    const secret = `ghp_${'b'.repeat(36)}`;
    const art = scan(`token=${secret}`).artifacts[0] as SecretReportArtifact;
    const f = art.value.findings.find((x) => x.ruleId === 'github.token')!;
    expect(f.preview).not.toBe(secret);
    expect(f.preview).toContain('•');
    expect(JSON.stringify(art)).not.toContain(secret);
  });

  it('reports correct 1-based line + column', () => {
    const f = report('line1 ok\nleak = AKIAIOSFODNN7EXAMPLE').findings.find(
      (x) => x.ruleId === 'aws.access-key',
    )!;
    expect(f.line).toBe(2);
    expect(f.column).toBe(8); // "leak = " is 7 chars → key starts at column 8
  });

  it('emits secret.empty_input for empty and secret.clean for clean input', () => {
    expect(scan('   ').diagnostics.map((d) => d.code)).toContain('secret.empty_input');
    expect(scan('nothing secret here').diagnostics.map((d) => d.code)).toContain('secret.clean');
  });

  it('emits one secret.finding diagnostic per finding (high→error severity)', () => {
    const diags = scan('k=AKIAIOSFODNN7EXAMPLE').diagnostics.filter((d) => d.code === 'secret.finding');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.severity).toBe('error');
  });

  it('produces a secret.report artifact that validates against the artifact schema', () => {
    const validation = validate('artifact', scan('k=AKIAIOSFODNN7EXAMPLE').artifacts[0] as Artifact);
    expect(validation.ok, validation.errors.join('; ')).toBe(true);
  });
});

describe('NekoSecrets: exporters', () => {
  it('secret.export.json emits masked findings', () => {
    const out = runExporter(registry(), 'secrets', 'secret.export.json', {
      artifacts: scan('k=AKIAIOSFODNN7EXAMPLE').artifacts,
      diagnostics: [],
    });
    const parsed = JSON.parse(String(out.body));
    expect(parsed.findingCount).toBe(1);
    expect(parsed.findings[0].preview).toContain('•');
  });

  it('secret.export.csv emits a header + one row per finding', () => {
    const out = runExporter(registry(), 'secrets', 'secret.export.csv', {
      artifacts: scan('k=AKIAIOSFODNN7EXAMPLE').artifacts,
      diagnostics: [],
    });
    const rows = String(out.body).split('\n');
    expect(rows[0]).toBe('ruleId,severity,line,column,length,preview,entropy');
    expect(rows).toHaveLength(2);
  });

  it('secret.export.markdown.summary lists severity counts', () => {
    const out = runExporter(registry(), 'secrets', 'secret.export.markdown.summary', {
      artifacts: scan('k=AKIAIOSFODNN7EXAMPLE').artifacts,
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toContain('# NekoSecrets export');
    expect(body).toContain('high: 1');
  });

  it('the exporter refuses a foreign artifact kind', () => {
    const foreign = { ...(scan('a=1').artifacts[0] as Artifact), kind: 'json.value' } as Artifact;
    for (const id of ['secret.export.json', 'secret.export.csv', 'secret.export.markdown.summary']) {
      expect(() =>
        runExporter(registry(), 'secrets', id, { artifacts: [foreign], diagnostics: [] }),
      ).toThrow(/does not accept artifact kind/);
    }
  });
});

describe('NekoSecrets: workspace round-trip', () => {
  it('a secret-report workspace round-trips losslessly (masked)', () => {
    const parsed = scan('aws=AKIAIOSFODNN7EXAMPLE\ntoken=ghp_' + 'c'.repeat(36));
    const ws: Workspace = {
      version: 1,
      id: 'ws_secret_single',
      toolId: 'secrets',
      toolVersion: 1,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { viewMode: 'findings' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
