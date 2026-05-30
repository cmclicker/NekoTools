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

import { FIXED_CLOCK, auditCsp, buildCspRegistration, cspManifest } from '../index.js';
import type { CspParsedArtifact } from '../kinds.js';

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

const clock = FIXED_CLOCK('2026-05-28T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildCspRegistration(clock));
  return r;
}

function parse(raw: string) {
  return runParser(registry(), 'csp', 'csp.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function report(raw: string) {
  return (parse(raw).artifacts[0] as CspParsedArtifact).value;
}

function codes(raw: string): string[] {
  return parse(raw).diagnostics.map((d) => d.code);
}

describe('NekoCSP: manifest', () => {
  it('passes schema + cross-field validation', () => {
    expect(validateManifest(cspManifest).ok).toBe(true);
  });
  it('declares network-forbidden offline policy', () => {
    expect(cspManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });
  it('free entitlements match the implemented slice', () => {
    expect(new Set(cspManifest.entitlements.free)).toEqual(
      new Set([
        'parse',
        'inspect.directives',
        'audit.findings',
        'diagnostics.security',
        'export.json',
        'export.normalized',
        'export.markdown.summary',
        'copy.output',
        'workspace.save',
      ]),
    );
  });
});

describe('NekoCSP: monetization gating (single-build, entitlement-gated)', () => {
  const proExporterIds = ['csp.export.report', 'csp.export.hardened'];

  it('Pro exporters are declared AND registered as proExporters, not free', () => {
    const reg = buildCspRegistration(clock);
    const proIds = new Set((reg.proExporters ?? []).map((e) => e.id));
    for (const id of proExporterIds) {
      expect(cspManifest.exporters).toContain(id);
      expect(proIds.has(id)).toBe(true);
      expect(reg.exporters.some((e) => e.id === id)).toBe(false);
    }
  });

  it('declares the matching pro entitlement features', () => {
    expect(cspManifest.entitlements.pro).toContain('export.report');
    expect(cspManifest.entitlements.pro).toContain('export.hardened');
    expect(cspManifest.entitlements.pro).toContain('suggest.hardened');
  });

  it('a free caller (default entitlement) is refused with EntitlementError', () => {
    const r = registry();
    const parsed = parse("script-src 'unsafe-inline'");
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'csp', id, parsed)).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the posture report + hardened-policy exporters', () => {
    const r = registry();
    const parsed = parse("script-src 'unsafe-inline' 'unsafe-eval'; img-src *");

    const report = String(runExporter(r, 'csp', 'csp.export.report', parsed, PRO).body);
    expect(report).toContain('# NekoCSP posture audit');
    expect(report).toContain('csp.unsafe_inline');

    const hardened = String(runExporter(r, 'csp', 'csp.export.hardened', parsed, PRO).body);
    expect(hardened).toContain('# NekoCSP hardened policy');
    // The emitted policy is the last non-comment line; the comment block above
    // it is the changelog (which legitimately names the removed tokens).
    const policy = hardened.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#')).at(-1) ?? '';
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain('*');
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
  });

  it('a truly unknown exporter id still throws "unknown exporter"', () => {
    expect(() =>
      runExporter(registry(), 'csp', 'csp.export.nope', { artifacts: [], diagnostics: [] }, PRO),
    ).toThrow(/unknown exporter/);
  });
});

describe('NekoCSP: posture audit', () => {
  it('reuses the diagnostic codes and ranks unsafe-eval as high', () => {
    const f = auditCsp(report("script-src 'unsafe-eval'")).find((x) => x.ruleId === 'csp.unsafe_eval');
    expect(f?.severity).toBe('high');
  });

  it('adds posture rules the free parser does not run', () => {
    const ids = auditCsp(report("default-src 'self'; object-src 'none'; frame-ancestors 'none'")).map(
      (f) => f.ruleId,
    );
    expect(ids).toContain('csp.missing_base_uri');
    expect(ids).toContain('csp.missing_form_action');
    expect(ids).toContain('csp.no_reporting');
  });

  it('flags an insecure (non-TLS) scheme source', () => {
    expect(auditCsp(report('img-src http://cdn.example.com')).map((f) => f.ruleId)).toContain(
      'csp.insecure_scheme',
    );
  });

  it('a hardened policy yields no high/medium findings', () => {
    const findings = auditCsp(
      report(
        "default-src 'none'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; report-uri /csp",
      ),
    );
    expect(findings.every((f) => f.severity === 'low' || f.severity === 'info')).toBe(true);
  });

  it('returns nothing for an absent report', () => {
    expect(auditCsp(undefined)).toEqual([]);
  });
});

describe('NekoCSP: parsing', () => {
  it('parses directives + sources', () => {
    const v = report("default-src 'self'; script-src 'self' https://cdn.example.com");
    expect(v.directiveCount).toBe(2);
    expect(v.directives[0]).toEqual({ name: 'default-src', sources: ["'self'"] });
    expect(v.directives[1]!.sources).toContain('https://cdn.example.com');
  });

  it('strips a Content-Security-Policy: header prefix', () => {
    expect(report("Content-Security-Policy: default-src 'self'").directiveCount).toBe(1);
  });

  it('lowercases directive names', () => {
    expect(report("Script-Src 'self'").directives[0]!.name).toBe('script-src');
  });
});

describe('NekoCSP: security findings', () => {
  it('flags unsafe-inline in script-src as high', () => {
    expect(codes("script-src 'self' 'unsafe-inline'")).toContain('csp.unsafe_inline');
  });
  it('flags unsafe-eval', () => {
    expect(codes("script-src 'unsafe-eval'")).toContain('csp.unsafe_eval');
  });
  it('flags a wildcard source', () => {
    expect(codes('img-src *')).toContain('csp.wildcard');
  });
  it('flags data: in script-src', () => {
    expect(codes('script-src data:')).toContain('csp.data_uri');
  });
  it('flags a duplicate directive', () => {
    expect(codes("script-src 'self'; script-src 'none'")).toContain('csp.duplicate');
  });
  it('notes missing default-src / object-src / frame-ancestors', () => {
    const c = codes("script-src 'self'");
    expect(c.filter((x) => x === 'csp.missing_directive').length).toBeGreaterThanOrEqual(1);
  });
  it('a locked-down policy has no high/medium findings for those checks', () => {
    const v = report("default-src 'none'; script-src 'self'; object-src 'none'; frame-ancestors 'none'");
    expect(v.findings.every((f) => f.severity === 'low' || f.severity === undefined)).toBe(true);
  });
  it('emits csp.empty_input for empty input', () => {
    expect(codes('   ')).toContain('csp.empty_input');
  });
  it('produces a schema-valid artifact', () => {
    expect(validate('artifact', parse("default-src 'self'").artifacts[0] as Artifact).ok).toBe(true);
  });
});

describe('NekoCSP: exporters', () => {
  it('csp.export.normalized re-serializes one directive per line', () => {
    const out = runExporter(registry(), 'csp', 'csp.export.normalized', {
      artifacts: parse("default-src 'self'; img-src *").artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toBe("default-src 'self';\nimg-src *");
  });
  it('csp.export.markdown.summary lists directives + findings', () => {
    const out = runExporter(registry(), 'csp', 'csp.export.markdown.summary', {
      artifacts: parse("script-src 'unsafe-inline'").artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toContain('# NekoCSP export');
    expect(String(out.body)).toContain('unsafe-inline');
  });
  it('refuses a foreign artifact kind', () => {
    const foreign = { ...(parse("default-src 'self'").artifacts[0] as Artifact), kind: 'json.value' } as Artifact;
    expect(() =>
      runExporter(registry(), 'csp', 'csp.export.json', { artifacts: [foreign], diagnostics: [] }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoCSP: workspace round-trip', () => {
  it('round-trips losslessly', () => {
    const parsed = parse("default-src 'self'; script-src 'self' 'unsafe-inline'");
    const ws: Workspace = {
      version: 1,
      id: 'ws_csp_single',
      toolId: 'csp',
      toolVersion: 1,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { viewMode: 'directives' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
