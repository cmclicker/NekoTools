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

import { FIXED_CLOCK, buildSortRegistration, sortManifest, transformLines, DEFAULT_OPTIONS } from '../index.js';
import type { SortParsedArtifact } from '../kinds.js';

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
  r.register(buildSortRegistration(clock));
  return r;
}

function parse(raw: string, hints?: Record<string, unknown>) {
  return runParser(registry(), 'sort', 'sort.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
    ...(hints ? { hints } : {}),
  });
}

function lines(raw: string, hints?: Record<string, unknown>): readonly string[] {
  return (parse(raw, hints).artifacts[0] as SortParsedArtifact).value.lines;
}

describe('NekoSort: manifest', () => {
  it('passes schema + cross-field validation', () => {
    expect(validateManifest(sortManifest).ok).toBe(true);
  });
  it('declares network-forbidden offline policy', () => {
    expect(sortManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });
  it('free entitlements match the implemented slice', () => {
    expect(new Set(sortManifest.entitlements.free)).toEqual(
      new Set([
        'sort',
        'dedupe',
        'trim',
        'inspect.counts',
        'diagnostics.lines',
        'export.json',
        'export.normalized',
        'export.markdown.summary',
        'copy.output',
        'workspace.save',
      ]),
    );
  });
});

describe('NekoSort: monetization gating (single-build, entitlement-gated)', () => {
  const registration = buildSortRegistration(clock);
  // One declared Pro id is built + gated; the other (input/output diff) needs
  // the pre-transform input the artifact doesn't retain, so it stays
  // advertising-only.
  const builtProIds = ['sort.export.frequency'];
  const advertisingOnlyIds = ['sort.export.diff'];

  it('the built Pro exporter is declared AND registered as a proExporter, not free', () => {
    const free = new Set(registration.exporters.map((e) => e.id));
    const pro = new Set((registration.proExporters ?? []).map((e) => e.id));
    for (const id of builtProIds) {
      expect(sortManifest.exporters).toContain(id);
      expect(pro.has(id)).toBe(true);
      expect(free.has(id)).toBe(false);
    }
  });

  it('the advertising-only Pro id is declared but registered nowhere (still "unknown exporter")', () => {
    const free = new Set(registration.exporters.map((e) => e.id));
    const pro = new Set((registration.proExporters ?? []).map((e) => e.id));
    const r = registry();
    for (const id of advertisingOnlyIds) {
      expect(sortManifest.exporters).toContain(id);
      expect(free.has(id)).toBe(false);
      expect(pro.has(id)).toBe(false);
      expect(() => runExporter(r, 'sort', id, { artifacts: [], diagnostics: [] }, PRO)).toThrow(
        /unknown exporter/,
      );
    }
  });

  it('a free caller (default entitlement) is refused the built Pro exporter with EntitlementError', () => {
    const r = registry();
    const parsed = parse('banana\napple\nbanana\ncherry\napple\nbanana');
    for (const id of builtProIds) {
      expect(() => runExporter(r, 'sort', id, parsed)).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the frequency exporter', () => {
    const r = registry();
    // No unique → output keeps all lines, so frequencies are real multiplicities.
    const parsed = parse('banana\napple\nbanana\ncherry\napple\nbanana');
    const csv = String(runExporter(r, 'sort', 'sort.export.frequency', parsed, PRO).body);
    expect(csv.split('\n')[0]).toBe('count,line');
    expect(csv).toContain('3,banana'); // most frequent first
    expect(csv).toContain('2,apple');
    expect(csv).toContain('1,cherry');
  });

  it('a truly unknown exporter id still throws "unknown exporter"', () => {
    expect(() =>
      runExporter(registry(), 'sort', 'sort.export.nope', { artifacts: [], diagnostics: [] }, PRO),
    ).toThrow(/unknown exporter/);
  });
});

describe('NekoSort: transforms', () => {
  it('sorts ascending by default', () => {
    expect(lines('banana\napple\ncherry')).toEqual(['apple', 'banana', 'cherry']);
  });

  it('sorts descending', () => {
    expect(lines('apple\nbanana\ncherry', { order: 'desc' })).toEqual(['cherry', 'banana', 'apple']);
  });

  it('dedupes with unique', () => {
    expect(lines('a\nb\na\nc\nb', { order: 'original', unique: true })).toEqual(['a', 'b', 'c']);
  });

  it('sorts numerically', () => {
    expect(lines('10\n2\n1', { numeric: true })).toEqual(['1', '2', '10']);
  });

  it('is case-insensitive when requested', () => {
    expect(lines('B\na\nC', { caseInsensitive: true })).toEqual(['a', 'B', 'C']);
  });

  it('trims and removes blank lines', () => {
    expect(lines('  a  \n\n b ', { order: 'original', trimLines: true, removeBlank: true })).toEqual(['a', 'b']);
  });

  it('preserves original order with order=original', () => {
    expect(lines('c\na\nb', { order: 'original' })).toEqual(['c', 'a', 'b']);
  });

  it('transformLines is callable directly (stable sort)', () => {
    const res = transformLines('b\na\nb', { ...DEFAULT_OPTIONS, unique: true });
    expect(res.lines).toEqual(['a', 'b']);
    expect(res.removed).toBe(1);
  });
});

describe('NekoSort: diagnostics', () => {
  it('emits sort.empty_input for empty input', () => {
    expect(parse('   ').diagnostics.map((d) => d.code)).toContain('sort.empty_input');
  });
  it('emits sort.removed_lines when dedupe drops lines', () => {
    expect(parse('a\na', { unique: true }).diagnostics.map((d) => d.code)).toContain('sort.removed_lines');
  });
  it('produces a schema-valid artifact', () => {
    expect(validate('artifact', parse('a\nb').artifacts[0] as Artifact).ok).toBe(true);
  });
});

describe('NekoSort: exporters', () => {
  it('sort.export.normalized joins the result lines', () => {
    const out = runExporter(registry(), 'sort', 'sort.export.normalized', {
      artifacts: parse('b\na').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toBe('a\nb');
  });
  it('sort.export.markdown.summary reports counts', () => {
    const out = runExporter(registry(), 'sort', 'sort.export.markdown.summary', {
      artifacts: parse('a\na\nb', { unique: true }).artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toContain('# NekoSort export');
    expect(String(out.body)).toContain('removed: 1');
  });
  it('refuses a foreign artifact kind', () => {
    const foreign = { ...(parse('a').artifacts[0] as Artifact), kind: 'json.value' } as Artifact;
    expect(() =>
      runExporter(registry(), 'sort', 'sort.export.json', { artifacts: [foreign], diagnostics: [] }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoSort: workspace round-trip', () => {
  it('round-trips losslessly', () => {
    const parsed = parse('b\na\nc', { unique: true });
    const ws: Workspace = {
      version: 1,
      id: 'ws_sort_single',
      toolId: 'sort',
      toolVersion: 1,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { order: 'asc' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
