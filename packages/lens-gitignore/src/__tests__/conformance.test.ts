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

import { FIXED_CLOCK, auditGitignore, buildGitignoreRegistration, gitignoreManifest } from '../index.js';
import type { GitignoreParsedArtifact } from '../kinds.js';

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
  r.register(buildGitignoreRegistration(clock));
  return r;
}

function parse(raw: string, paths?: string) {
  return runParser(registry(), 'gitignore', 'gitignore.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
    ...(paths ? { hints: { paths } } : {}),
  });
}

function report(raw: string, paths?: string) {
  return (parse(raw, paths).artifacts[0] as GitignoreParsedArtifact).value;
}

function ignored(gitignore: string, path: string): boolean {
  return report(gitignore, path).paths[0]!.ignored;
}

describe('NekoGitignore: manifest', () => {
  it('passes schema + cross-field validation', () => {
    expect(validateManifest(gitignoreManifest).ok).toBe(true);
  });
  it('declares network-forbidden offline policy', () => {
    expect(gitignoreManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });
  it('free entitlements match the implemented slice', () => {
    expect(new Set(gitignoreManifest.entitlements.free)).toEqual(
      new Set([
        'parse',
        'classify.patterns',
        'test.paths',
        'diagnostics.structure',
        'export.json',
        'export.normalized',
        'export.markdown.summary',
        'copy.output',
        'workspace.save',
      ]),
    );
  });
});

describe('NekoGitignore: monetization gating (single-build, entitlement-gated)', () => {
  const proExporterIds = ['gitignore.export.audit.report', 'gitignore.export.sarif'];

  it('Pro exporters are declared AND registered as proExporters, not free', () => {
    const reg = buildGitignoreRegistration(clock);
    const proIds = new Set((reg.proExporters ?? []).map((e) => e.id));
    for (const id of proExporterIds) {
      expect(gitignoreManifest.exporters).toContain(id);
      expect(proIds.has(id)).toBe(true);
      expect(reg.exporters.some((e) => e.id === id)).toBe(false);
    }
  });

  it('does not register the future regex/merged generators as exporters', () => {
    expect(gitignoreManifest.exporters).not.toContain('gitignore.export.regex');
    expect(gitignoreManifest.exporters).not.toContain('gitignore.export.merged');
    expect(gitignoreManifest.entitlements.pro).toContain('export.regex');
    expect(gitignoreManifest.entitlements.pro).toContain('export.merged');
  });

  it('a free caller (default entitlement) is refused with EntitlementError', () => {
    const r = registry();
    const parsed = parse('node_modules/');
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'gitignore', id, parsed)).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the audit report + SARIF exporters', () => {
    const r = registry();
    const parsed = parse('node_modules/\n*.log');

    const auditReport = String(
      runExporter(r, 'gitignore', 'gitignore.export.audit.report', parsed, PRO).body,
    );
    expect(auditReport).toContain('# NekoGitignore secret-coverage audit');
    expect(auditReport).toContain('gitignore.uncovered_secret');

    const sarifResult = runExporter(r, 'gitignore', 'gitignore.export.sarif', parsed, PRO);
    expect(sarifResult.mimeType).toBe('application/sarif+json');
    expect(sarifResult.extension).toBe('sarif');
    const sarif = JSON.parse(String(sarifResult.body));
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].tool.driver.name).toBe('NekoGitignore');
    expect(
      sarif.runs[0].results.some((x: { ruleId: string }) => x.ruleId === 'gitignore.uncovered_secret'),
    ).toBe(true);
  });

  it('a truly unknown exporter id still throws "unknown exporter"', () => {
    expect(() =>
      runExporter(registry(), 'gitignore', 'gitignore.export.nope', { artifacts: [], diagnostics: [] }, PRO),
    ).toThrow(/unknown exporter/);
  });
});

describe('NekoGitignore: secret-coverage audit', () => {
  const audit = (raw: string) => auditGitignore(report(raw));

  it('flags uncovered secret paths on a minimal ignore, ranking .env high', () => {
    const ids = audit('node_modules/\ndist/').map((f) => f.ruleId);
    expect(ids).toContain('gitignore.uncovered_secret');
    expect(audit('node_modules/').find((f) => f.target === '.env')?.severity).toBe('high');
  });

  it('does not flag a secret path once it is covered', () => {
    expect(audit('.env\n*.pem\nid_rsa').find((f) => f.target === '.env')).toBeUndefined();
  });

  it('a comprehensive ignore yields no high/medium coverage findings', () => {
    const findings = audit(
      '.env\n.env.*\nid_rsa\nid_ed25519\n*.pem\n*.key\n*.p12\n*.pfx\n*.keystore\ncredentials.json\n.npmrc\n.pypirc\n.DS_Store\n*.log',
    );
    expect(findings.every((f) => f.severity === 'low' || f.severity === 'info')).toBe(true);
  });

  it('flags duplicate patterns as a hygiene finding', () => {
    expect(audit('.env\nfoo\nfoo').map((f) => f.ruleId)).toContain('gitignore.duplicate');
  });

  it('returns nothing for an absent report', () => {
    expect(auditGitignore(undefined)).toEqual([]);
  });
});

describe('NekoGitignore: classification', () => {
  it('classifies comments, blanks, negation, dir-only, and anchoring', () => {
    const rules = report('# comment\n\nnode_modules/\n!keep.txt\n/root-only\nsrc/*.log').rules;
    expect(rules[0]).toMatchObject({ comment: true });
    expect(rules[1]).toMatchObject({ blank: true });
    expect(rules[2]).toMatchObject({ pattern: 'node_modules', dirOnly: true });
    expect(rules[3]).toMatchObject({ pattern: 'keep.txt', negated: true });
    expect(rules[4]).toMatchObject({ pattern: 'root-only', anchored: true });
    expect(rules[5]).toMatchObject({ pattern: 'src/*.log', anchored: true });
  });

  it('counts patterns vs comments', () => {
    const v = report('# a\nfoo\nbar\n# b');
    expect(v.patternCount).toBe(2);
    expect(v.commentCount).toBe(2);
  });
});

describe('NekoGitignore: path testing', () => {
  it('matches a basename pattern at any depth', () => {
    expect(ignored('*.log', 'app.log')).toBe(true);
    expect(ignored('*.log', 'src/deep/app.log')).toBe(true);
    expect(ignored('*.log', 'app.txt')).toBe(false);
  });

  it('anchors a rooted pattern', () => {
    expect(ignored('/build', 'build')).toBe(true);
    expect(ignored('/build', 'src/build')).toBe(false);
  });

  it('ignores directory contents for a dir-only pattern', () => {
    expect(ignored('node_modules/', 'node_modules/react/index.js')).toBe(true);
  });

  it('honors negation as last-match-wins re-inclusion', () => {
    const r = report('*.log\n!important.log', 'important.log');
    expect(r.paths[0]!.ignored).toBe(false);
    expect(report('*.log\n!important.log', 'other.log').paths[0]!.ignored).toBe(true);
  });

  it('supports ** across directories', () => {
    expect(ignored('**/dist', 'a/b/dist')).toBe(true);
    expect(ignored('docs/**/*.md', 'docs/a/b/readme.md')).toBe(true);
  });

  it('records the deciding rule line number', () => {
    const r = report('*.log\n!keep.log', 'keep.log');
    expect(r.paths[0]!.matchedBy).toBe(2);
  });
});

describe('NekoGitignore: diagnostics', () => {
  it('emits gitignore.empty_input for empty input', () => {
    expect(parse('   ').diagnostics.map((d) => d.code)).toContain('gitignore.empty_input');
  });
  it('emits gitignore.duplicate for a repeated pattern', () => {
    expect(parse('foo\nbar\nfoo').diagnostics.map((d) => d.code)).toContain('gitignore.duplicate');
  });
  it('produces a schema-valid artifact', () => {
    expect(validate('artifact', parse('node_modules/').artifacts[0] as Artifact).ok).toBe(true);
  });
});

describe('NekoGitignore: exporters', () => {
  it('gitignore.export.normalized strips comments + blanks', () => {
    const out = runExporter(registry(), 'gitignore', 'gitignore.export.normalized', {
      artifacts: parse('# c\n\nfoo\nbar/').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toBe('foo\nbar/');
  });
  it('gitignore.export.markdown.summary tabulates rules', () => {
    const out = runExporter(registry(), 'gitignore', 'gitignore.export.markdown.summary', {
      artifacts: parse('node_modules/').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toContain('# NekoGitignore export');
    expect(String(out.body)).toContain('node_modules');
  });
  it('refuses a foreign artifact kind', () => {
    const foreign = { ...(parse('foo').artifacts[0] as Artifact), kind: 'json.value' } as Artifact;
    expect(() =>
      runExporter(registry(), 'gitignore', 'gitignore.export.json', { artifacts: [foreign], diagnostics: [] }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoGitignore: workspace round-trip', () => {
  it('round-trips losslessly', () => {
    const parsed = parse('node_modules/\n*.log\n!keep.log', 'app.log\nkeep.log');
    const ws: Workspace = {
      version: 1,
      id: 'ws_gitignore_single',
      toolId: 'gitignore',
      toolVersion: 1,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { viewMode: 'rules' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
