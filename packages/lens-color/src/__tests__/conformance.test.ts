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
  buildColorRegistration,
  colorManifest,
  contrastRatio,
  parseColor,
  relativeLuminance,
} from '../index.js';
import type { ColorParsedArtifact, ParsedColor } from '../kinds.js';

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
  r.register(buildColorRegistration(clock));
  return r;
}

function parse(raw: string) {
  return runParser(registry(), 'color', 'color.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function one(raw: string): ParsedColor {
  return (parse(raw).artifacts[0] as ColorParsedArtifact).value.colors[0]!;
}

describe('NekoColor: manifest', () => {
  it('passes schema + cross-field validation', () => {
    expect(validateManifest(colorManifest).ok).toBe(true);
  });
  it('declares network-forbidden offline policy', () => {
    expect(colorManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });
  it('free entitlements match the implemented slice', () => {
    expect(new Set(colorManifest.entitlements.free)).toEqual(
      new Set([
        'parse',
        'convert.hex',
        'convert.rgb',
        'convert.hsl',
        'inspect.contrast',
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

describe('NekoColor: monetization gating (single-build, entitlement-gated)', () => {
  const registration = buildColorRegistration(clock);
  const proExporterIds = ['color.export.palette', 'color.export.css-vars'];

  it('Pro exporters are declared AND registered as proExporters, not free', () => {
    const free = new Set(registration.exporters.map((e) => e.id));
    const pro = new Set((registration.proExporters ?? []).map((e) => e.id));
    for (const id of proExporterIds) {
      expect(colorManifest.exporters).toContain(id);
      expect(pro.has(id)).toBe(true);
      expect(free.has(id)).toBe(false);
    }
  });

  it('a free caller (default entitlement) is refused with EntitlementError', () => {
    const r = registry();
    const parsed = parse('#3b82f6');
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'color', id, parsed)).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the palette + css-vars exporters', () => {
    const r = registry();
    const parsed = parse('#3b82f6');

    const palette = String(runExporter(r, 'color', 'color.export.palette', parsed, PRO).body);
    expect(palette).toContain('# NekoColor palette');
    expect(palette).toContain('| 500 |');
    expect(palette).toContain('#3b82f6'); // the base at stop 500 (toHex is lowercase)

    const css = String(runExporter(r, 'color', 'color.export.css-vars', parsed, PRO).body);
    expect(css).toContain(':root {');
    expect(css).toContain('--color-500: #3b82f6;');
    expect(css).toContain('--color-50:');
  });

  it('a truly unknown exporter id still throws "unknown exporter"', () => {
    expect(() =>
      runExporter(registry(), 'color', 'color.export.nope', { artifacts: [], diagnostics: [] }, PRO),
    ).toThrow(/unknown exporter/);
  });
});

describe('NekoColor: parsing + conversion', () => {
  it('normalizes hex / rgb / hsl / named / short-hex to the same color', () => {
    for (const input of ['#ff0000', 'rgb(255, 0, 0)', 'hsl(0, 100%, 50%)', 'red', '#f00', 'RED']) {
      expect(one(input).hex).toBe('#ff0000');
    }
  });

  it('reports the source format', () => {
    expect(one('#ff0000').format).toBe('hex');
    expect(one('rgb(255,0,0)').format).toBe('rgb');
    expect(one('hsl(0,100%,50%)').format).toBe('hsl');
    expect(one('red').format).toBe('named');
  });

  it('round-trips RGB → HSL → RGB form for red', () => {
    expect(one('#ff0000').rgb).toBe('rgb(255, 0, 0)');
    expect(one('#ff0000').hsl).toBe('hsl(0, 100%, 50%)');
  });

  it('handles alpha (8-digit hex + rgba)', () => {
    expect(one('rgba(0, 0, 0, 0.5)').hex).toBe('#00000080');
    expect(one('#00000080').rgba!.a).toBe(0.5);
  });

  it('parses percentage rgb channels', () => {
    expect(one('rgb(100%, 0%, 0%)').hex).toBe('#ff0000');
  });
});

describe('NekoColor: WCAG luminance + contrast', () => {
  it('white luminance 1, black luminance 0', () => {
    expect(relativeLuminance(parseColor('#ffffff')!.rgba)).toBe(1);
    expect(relativeLuminance(parseColor('#000000')!.rgba)).toBe(0);
  });

  it('white-on-black contrast is the maximal 21:1', () => {
    expect(contrastRatio(1, 0)).toBe(21);
    expect(one('#ffffff').contrastBlack).toBe(21);
    expect(one('#000000').contrastWhite).toBe(21);
  });

  it('white vs white is 1:1', () => {
    expect(one('#ffffff').contrastWhite).toBe(1);
  });
});

describe('NekoColor: diagnostics', () => {
  it('emits color.empty_input for empty input', () => {
    expect(parse('   ').diagnostics.map((d) => d.code)).toContain('color.empty_input');
  });
  it('emits color.parse_error (warning) for an unrecognized color, keeping valid ones', () => {
    const result = parse('#ff0000\nnotacolor');
    const v = result.artifacts[0] as ColorParsedArtifact;
    expect(v.value.colors[0]!.valid).toBe(true);
    expect(v.value.colors[1]!.valid).toBe(false);
    expect(result.diagnostics.find((d) => d.code === 'color.parse_error')?.severity).toBe('warning');
  });
  it('produces a schema-valid artifact', () => {
    expect(validate('artifact', parse('#abcdef').artifacts[0] as Artifact).ok).toBe(true);
  });
});

describe('NekoColor: exporters', () => {
  it('color.export.normalized emits hex per line, skipping invalid', () => {
    const out = runExporter(registry(), 'color', 'color.export.normalized', {
      artifacts: parse('red\nnope\nblue').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toBe('#ff0000\n#0000ff');
  });
  it('color.export.markdown.summary tabulates colors + contrast', () => {
    const out = runExporter(registry(), 'color', 'color.export.markdown.summary', {
      artifacts: parse('#ffffff').artifacts,
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toContain('# NekoColor export');
    expect(body).toContain('#ffffff');
    expect(body).toContain('21:1');
  });
  it('refuses a foreign artifact kind', () => {
    const foreign = { ...(parse('#fff').artifacts[0] as Artifact), kind: 'json.value' } as Artifact;
    expect(() =>
      runExporter(registry(), 'color', 'color.export.json', { artifacts: [foreign], diagnostics: [] }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoColor: workspace round-trip', () => {
  it('round-trips losslessly', () => {
    const parsed = parse('#ff0000\nrgb(0, 128, 255)');
    const ws: Workspace = {
      version: 1,
      id: 'ws_color_single',
      toolId: 'color',
      toolVersion: 1,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { viewMode: 'swatches' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
