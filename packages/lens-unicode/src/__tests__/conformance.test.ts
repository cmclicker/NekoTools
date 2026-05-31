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

import { FIXED_CLOCK, buildUnicodeRegistration, describeCodepoint, scanUnicode, unicodeManifest } from '../index.js';
import type { UnicodeParsedArtifact } from '../kinds.js';

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
  r.register(buildUnicodeRegistration(clock));
  return r;
}

function parse(raw: string) {
  return runParser(registry(), 'unicode', 'unicode.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function report(raw: string) {
  return (parse(raw).artifacts[0] as UnicodeParsedArtifact).value;
}

describe('NekoUnicode: manifest', () => {
  it('passes schema + cross-field validation', () => {
    expect(validateManifest(unicodeManifest).ok).toBe(true);
  });
  it('declares network-forbidden offline policy', () => {
    expect(unicodeManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });
  it('free entitlements match the implemented slice', () => {
    expect(new Set(unicodeManifest.entitlements.free)).toEqual(
      new Set([
        'inspect.codepoints',
        'inspect.bytes',
        'inspect.category',
        'inspect.escapes',
        'diagnostics.text',
        'export.json',
        'export.normalized',
        'export.markdown.summary',
        'copy.output',
        'workspace.save',
      ]),
    );
  });
});

describe('NekoUnicode: monetization gating (single-build, entitlement-gated)', () => {
  const registration = buildUnicodeRegistration(clock);
  const proExporterIds = ['unicode.export.names', 'unicode.export.csv'];

  it('Pro exporters are declared AND registered as proExporters, not free', () => {
    const proIds = new Set((registration.proExporters ?? []).map((e) => e.id));
    const free = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) {
      expect(unicodeManifest.exporters).toContain(id);
      expect(proIds.has(id)).toBe(true);
      expect(free.has(id)).toBe(false);
    }
  });

  it('a free caller (default entitlement) is refused with EntitlementError', () => {
    const r = registry();
    const parsed = parse('A😀');
    for (const id of proExporterIds) {
      expect(() =>
        runExporter(r, 'unicode', id, { artifacts: parsed.artifacts, diagnostics: [] }),
      ).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the names + CSV exporters with real output', () => {
    const r = registry();
    // 'A' (letter) + TAB (C0 control) + NO-BREAK SPACE (curated) + 中 (fallback).
    const parsed = parse('A\t 中');

    const names = String(
      runExporter(r, 'unicode', 'unicode.export.names', {
        artifacts: parsed.artifacts,
        diagnostics: [],
      }, PRO).body,
    );
    expect(names).toContain('# NekoUnicode names');
    expect(names).toContain('| codepoint | char | name |');
    expect(names).toContain('CHARACTER TABULATION'); // algorithmic C0 control name
    expect(names).toContain('NO-BREAK SPACE'); // curated map
    expect(names).toContain('U+4E2D (letter)'); // principled fallback, never a wrong name

    const csv = String(
      runExporter(r, 'unicode', 'unicode.export.csv', {
        artifacts: parsed.artifacts,
        diagnostics: [],
      }, PRO).body,
    );
    expect(csv.split('\r\n')[0]).toBe('index,codepoint,char,name,decimal,category,utf8,utf16,jsEscape,htmlEntity,urlEncoded');
    expect(csv).toContain('0,U+0041,A,');
    expect(csv).toContain('U+00A0');
    expect(csv).toContain('NO-BREAK SPACE');
  });

  it('a truly unknown exporter id still throws "unknown exporter"', () => {
    expect(() =>
      runExporter(registry(), 'unicode', 'unicode.export.nope', { artifacts: [], diagnostics: [] }, PRO),
    ).toThrow(/unknown exporter/);
  });
});

describe('NekoUnicode: codepoint analysis', () => {
  it('describes an ASCII letter', () => {
    const c = describeCodepoint(0x41);
    expect(c).toMatchObject({ char: 'A', hex: 'U+0041', decimal: 65, category: 'letter', utf8: '41', jsEscape: '\\u{41}' });
  });

  it('handles a multi-byte BMP character (é)', () => {
    const c = report('é').codepoints[0]!;
    expect(c.hex).toBe('U+00E9');
    expect(c.utf8).toBe('C3 A9');
  });

  it('handles an astral code point (emoji) as one code point, two UTF-16 units', () => {
    const v = report('😀');
    expect(v.codepointCount).toBe(1);
    expect(v.utf16UnitCount).toBe(2);
    expect(v.codepoints[0]!.hex).toBe('U+1F600');
    expect(v.codepoints[0]!.utf8).toBe('F0 9F 98 80');
  });

  it('counts code points, UTF-16 units, and bytes for mixed text', () => {
    const v = report('a😀b');
    expect(v.codepointCount).toBe(3);
    expect(v.utf16UnitCount).toBe(4);
    expect(v.byteLength).toBe(6);
  });

  it('classifies categories', () => {
    expect(report('5').codepoints[0]!.category).toBe('number');
    expect(report('!').codepoints[0]!.category).toBe('punctuation');
    expect(report(' ').codepoints[0]!.category).toBe('separator');
  });

  it('produces escape forms', () => {
    const c = report('<').codepoints[0]!;
    expect(c.htmlEntity).toBe('&#60;');
    expect(c.urlEncoded).toBe('%3C');
  });

  it('scanUnicode truncates beyond the limit', () => {
    const scan = scanUnicode('aaaaa', 3);
    expect(scan.codepointCount).toBe(5);
    expect(scan.codepoints).toHaveLength(3);
    expect(scan.truncated).toBe(true);
  });
});

describe('NekoUnicode: diagnostics', () => {
  it('emits unicode.empty_input only for a truly empty string (not whitespace)', () => {
    expect(parse('').diagnostics.map((d) => d.code)).toContain('unicode.empty_input');
    expect(parse(' ').diagnostics.map((d) => d.code)).not.toContain('unicode.empty_input');
  });
  it('emits unicode.control for control characters', () => {
    expect(parse('a\tb').diagnostics.map((d) => d.code)).toContain('unicode.control');
  });
  it('produces a schema-valid artifact', () => {
    expect(validate('artifact', parse('hi').artifacts[0] as Artifact).ok).toBe(true);
  });
});

describe('NekoUnicode: exporters', () => {
  it('unicode.export.normalized lists the code points', () => {
    const out = runExporter(registry(), 'unicode', 'unicode.export.normalized', {
      artifacts: parse('AB').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toBe('U+0041 U+0042');
  });
  it('unicode.export.markdown.summary reports counts', () => {
    const out = runExporter(registry(), 'unicode', 'unicode.export.markdown.summary', {
      artifacts: parse('😀').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toContain('# NekoUnicode export');
    expect(String(out.body)).toContain('U+1F600');
  });
  it('refuses a foreign artifact kind', () => {
    const foreign = { ...(parse('a').artifacts[0] as Artifact), kind: 'json.value' } as Artifact;
    expect(() =>
      runExporter(registry(), 'unicode', 'unicode.export.json', { artifacts: [foreign], diagnostics: [] }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoUnicode: workspace round-trip', () => {
  it('round-trips losslessly', () => {
    const parsed = parse('a😀');
    const ws: Workspace = {
      version: 1,
      id: 'ws_unicode_single',
      toolId: 'unicode',
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
