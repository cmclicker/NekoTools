import { describe, expect, it } from 'vitest';
import type { Entitlement } from '@nekotools/contracts';
import {
  EntitlementError,
  ToolRegistry,
  runExporter,
  runParser,
  validateManifest,
} from '@nekotools/tool-runtime';
import { validate } from '@nekotools/schemas';

import {
  FIXED_CLOCK,
  REGEX_KIND_MATCHSET,
  buildRegexRegistration,
  regexManifest,
} from '../index.js';
import type { RegexMatchSet, RegexMatchSetArtifact } from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-27T00:00:00.000Z');

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
  r.register(buildRegexRegistration(clock));
  return r;
}

function run(pattern: string, flags: string, sample: string) {
  return runParser(registry(), 'regex', 'regex.match', {
    raw: sample,
    source: { kind: 'paste', bytes: sample.length },
    hints: { pattern, flags },
  });
}

function matchSetOf(pattern: string, flags: string, sample: string): RegexMatchSet {
  const artifact = run(pattern, flags, sample).artifacts.find(
    (a) => a.kind === REGEX_KIND_MATCHSET,
  ) as RegexMatchSetArtifact;
  return artifact.value;
}

describe('NekoRegex: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(regexManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy', () => {
    expect(regexManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('declares Pro features even though the free build ships only free ones', () => {
    expect(regexManifest.entitlements.pro.length).toBeGreaterThan(0);
    expect(regexManifest.entitlements.free).toContain('test');
  });

  it('declares an out-of-scope list covering LLM explanation + regex generation', () => {
    expect(regexManifest.outOfScope.some((s) => /LLM|explanation/i.test(s))).toBe(true);
    expect(regexManifest.outOfScope.some((s) => /generat/i.test(s))).toBe(true);
  });

  it('capabilities reflect current-build truth (no workspace, no diff, no graph)', () => {
    expect(regexManifest.capabilities.canSaveWorkspace).toBe(false);
    expect(regexManifest.capabilities.canExport).toBe(true);
    expect(regexManifest.capabilities.canDiff).toBe(false);
    expect(regexManifest.capabilities.canProjectGraph).toBe(false);
  });
});

describe('NekoRegex: monetization gating (single-build, entitlement-gated)', () => {
  const registration = buildRegexRegistration(clock);
  // Two declared Pro ids are built + gated in this PR; two remain
  // advertising-only (saved suites / regression snapshots need the
  // not-yet-built saved-workspace engine — canSaveWorkspace is false).
  const builtProIds = ['regex.export.explain', 'regex.export.redaction.recipe'];
  const advertisingOnlyIds = ['regex.export.suite', 'regex.export.snapshot'];

  it('built Pro exporters are declared AND registered as proExporters, not free', () => {
    const free = new Set(registration.exporters.map((e) => e.id));
    const pro = new Set((registration.proExporters ?? []).map((e) => e.id));
    for (const id of builtProIds) {
      expect(regexManifest.exporters).toContain(id);
      expect(pro.has(id)).toBe(true);
      expect(free.has(id)).toBe(false);
    }
  });

  it('advertising-only Pro ids are declared but registered nowhere (still "unknown exporter")', () => {
    const free = new Set(registration.exporters.map((e) => e.id));
    const pro = new Set((registration.proExporters ?? []).map((e) => e.id));
    const r = registry();
    for (const id of advertisingOnlyIds) {
      expect(regexManifest.exporters).toContain(id);
      expect(free.has(id)).toBe(false);
      expect(pro.has(id)).toBe(false);
      expect(() => runExporter(r, 'regex', id, { artifacts: [], diagnostics: [] }, PRO)).toThrow(
        /unknown exporter/,
      );
    }
  });

  it('no graph projector is registered in the free build', () => {
    expect(registration.graphProjectors ?? []).toHaveLength(0);
  });

  it('a free caller (default entitlement) is refused the built Pro exporters with EntitlementError', () => {
    const r = registry();
    const parsed = run('(?<year>\\d{4})-\\d{2}', 'g', '2026-05 and 1999-12');
    for (const id of builtProIds) {
      expect(() => runExporter(r, 'regex', id, parsed)).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the explain + redaction-recipe exporters', () => {
    const r = registry();
    const parsed = run('(?<year>\\d{4})-\\d{2}', 'g', '2026-05 and 1999-12');

    const explain = String(runExporter(r, 'regex', 'regex.export.explain', parsed, PRO).body);
    expect(explain).toContain('# NekoRegex pattern explanation');
    expect(explain).toContain('named capture group "year"');
    expect(explain).toContain('digit [0-9]');

    const recipe = JSON.parse(
      String(runExporter(r, 'regex', 'regex.export.redaction.recipe', parsed, PRO).body),
    ) as { tool?: string; match?: { flags?: string }; replacement?: string; preserveGroups?: string[] };
    expect(recipe.tool).toBe('regex');
    expect(recipe.match?.flags).toContain('g'); // forced global for a redaction pass
    expect(recipe.replacement).toBe('[REDACTED]');
    expect(recipe.preserveGroups).toContain('year');
  });

  it('free entitlements match exactly the implemented Free-slice set', () => {
    const expectedFree = new Set([
      'test',
      'match.count',
      'match.list',
      'capture.groups',
      'named.groups',
      'match.indices',
      'diagnostics',
      'export.json',
      'export.markdown.summary',
      'export.pattern',
    ]);
    expect(new Set(regexManifest.entitlements.free)).toEqual(expectedFree);
  });
});

describe('NekoRegex: regex.match parser', () => {
  it('finds a single match for a non-global pattern', () => {
    const set = matchSetOf('a', '', 'banana');
    expect(set.valid).toBe(true);
    expect(set.matchCount).toBe(1);
    expect(set.matches[0]!.value).toBe('a');
    expect(set.matches[0]!.start).toBe(1);
    expect(set.matches[0]!.end).toBe(2);
  });

  it('finds every match for a global pattern', () => {
    const set = matchSetOf('a', 'g', 'banana');
    expect(set.matchCount).toBe(3);
    expect(set.matches.map((m) => m.start)).toEqual([1, 3, 5]);
    expect(set.flags.global).toBe(true);
  });

  it('extracts numbered capture groups', () => {
    const set = matchSetOf('(\\d{4})-(\\d{2})', '', '2026-05');
    expect(set.groupCount).toBe(2);
    const groups = set.matches[0]!.groups;
    expect(groups.map((g) => g.value)).toEqual(['2026', '05']);
    expect(groups.map((g) => g.index)).toEqual([1, 2]);
  });

  it('extracts named capture groups', () => {
    const set = matchSetOf('(?<year>\\d{4})-(?<month>\\d{2})', '', '2026-05');
    expect(set.namedGroupNames).toEqual(['year', 'month']);
    expect(set.matches[0]!.namedGroups).toEqual({ year: '2026', month: '05' });
  });

  it('reports group offsets when the `d` (hasIndices) flag is set', () => {
    const set = matchSetOf('(b)', 'd', 'abc');
    expect(set.flags.hasIndices).toBe(true);
    const group = set.matches[0]!.groups[0]!;
    expect(group.start).toBe(1);
    expect(group.end).toBe(2);
  });

  it('never throws and emits regex.invalid_pattern for an invalid pattern', () => {
    const call = () => run('(', '', 'abc');
    expect(call).not.toThrow();
    const result = call();
    expect(result.artifacts).toHaveLength(1);
    const set = (result.artifacts[0] as RegexMatchSetArtifact).value;
    expect(set.valid).toBe(false);
    expect(set.matchCount).toBe(0);
    const diag = result.diagnostics.find((d) => d.code === 'regex.invalid_pattern');
    expect(diag?.severity).toBe('error');
  });

  it('emits regex.unsupported_flag (error) for an unsupported flag, without throwing', () => {
    const call = () => run('a', 'z', 'banana');
    expect(call).not.toThrow();
    const result = call();
    const set = (result.artifacts[0] as RegexMatchSetArtifact).value;
    expect(set.valid).toBe(false);
    expect(set.flags.unsupported).toContain('z');
    expect(result.diagnostics.find((d) => d.code === 'regex.unsupported_flag')?.severity).toBe(
      'error',
    );
  });

  it('emits regex.empty_sample (info) for empty sample text', () => {
    const result = run('a', '', '');
    expect(result.diagnostics.find((d) => d.code === 'regex.empty_sample')?.severity).toBe('info');
  });

  it('emits regex.no_matches (info) for a valid pattern with zero matches', () => {
    const result = run('z', '', 'banana');
    expect(result.diagnostics.find((d) => d.code === 'regex.no_matches')?.severity).toBe('info');
  });

  it('emits regex.expensive_pattern (warning) for a nested quantifier', () => {
    const result = run('(a+)+', '', 'aaaa');
    expect(result.diagnostics.find((d) => d.code === 'regex.expensive_pattern')?.severity).toBe(
      'warning',
    );
  });

  it('caps the match list and flags regex.match_limit when truncated', () => {
    const r = new ToolRegistry();
    r.register(buildRegexRegistration(clock, { maxMatches: 2 }));
    const result = runParser(r, 'regex', 'regex.match', {
      raw: 'aaaaa',
      source: { kind: 'paste', bytes: 5 },
      hints: { pattern: 'a', flags: 'g' },
    });
    const set = (result.artifacts[0] as RegexMatchSetArtifact).value;
    expect(set.matchCount).toBe(2);
    expect(set.truncated).toBe(true);
    expect(result.diagnostics.find((d) => d.code === 'regex.match_limit')?.severity).toBe(
      'warning',
    );
  });

  it('produces a regex.matchset artifact that validates against the artifact schema', () => {
    const artifact = run('a', 'g', 'banana').artifacts[0]!;
    const validation = validate('artifact', artifact);
    expect(validation.ok, validation.errors.join('; ')).toBe(true);
  });
});

describe('NekoRegex: exporters', () => {
  it('regex.export.json emits the full match analysis', () => {
    const r = registry();
    const artifact = run('(a)', 'g', 'banana').artifacts[0] as RegexMatchSetArtifact;
    const out = runExporter(r, 'regex', 'regex.export.json', {
      artifacts: [artifact],
      diagnostics: [],
    });
    const parsed = JSON.parse(String(out.body)) as RegexMatchSet;
    expect(parsed.pattern).toBe('(a)');
    expect(parsed.matchCount).toBe(3);
    expect(out.extension).toBe('json');
  });

  it('regex.export.markdown.summary describes the run + diagnostics', () => {
    const r = registry();
    const artifact = run('z', '', 'banana').artifacts[0] as RegexMatchSetArtifact;
    const out = runExporter(r, 'regex', 'regex.export.markdown.summary', {
      artifacts: [artifact],
      diagnostics: [
        { version: 1, id: 'd1', severity: 'info', code: 'regex.no_matches', message: 'none' },
      ],
    });
    const body = String(out.body);
    expect(body).toContain('# NekoRegex export');
    expect(body).toContain('regex.no_matches');
  });

  it('regex.export.pattern emits a copy-paste-ready literal', () => {
    const r = registry();
    const artifact = run('a', 'gi', 'banana').artifacts[0] as RegexMatchSetArtifact;
    const out = runExporter(r, 'regex', 'regex.export.pattern', {
      artifacts: [artifact],
      diagnostics: [],
    });
    expect(String(out.body)).toContain('/a/gi');
  });
});
