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

import { FIXED_CLOCK, buildHexRegistration, decodeHex, dumpRows, hexManifest, textToBytes } from '../index.js';
import type { HexParsedArtifact } from '../kinds.js';

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
  r.register(buildHexRegistration(clock));
  return r;
}

function parse(raw: string, mode?: 'text' | 'hex') {
  return runParser(registry(), 'hex', 'hex.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
    ...(mode ? { hints: { mode } } : {}),
  });
}

function report(raw: string, mode?: 'text' | 'hex') {
  return (parse(raw, mode).artifacts[0] as HexParsedArtifact).value;
}

describe('NekoHex: manifest', () => {
  it('passes schema + cross-field validation', () => {
    expect(validateManifest(hexManifest).ok).toBe(true);
  });
  it('declares network-forbidden offline policy', () => {
    expect(hexManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });
  it('free entitlements match the implemented slice', () => {
    expect(new Set(hexManifest.entitlements.free)).toEqual(
      new Set([
        'dump.text',
        'decode.hex',
        'inspect.bytes',
        'diagnostics.hex',
        'export.json',
        'export.normalized',
        'export.markdown.summary',
        'copy.output',
        'workspace.save',
      ]),
    );
  });
});

describe('NekoHex: monetization gating (single-build, entitlement-gated)', () => {
  const registration = buildHexRegistration(clock);
  const proExporterIds = ['hex.export.c-array', 'hex.export.base64'];

  it('Pro exporters are declared AND registered as proExporters, not free', () => {
    const free = new Set(registration.exporters.map((e) => e.id));
    const pro = new Set((registration.proExporters ?? []).map((e) => e.id));
    for (const id of proExporterIds) {
      expect(hexManifest.exporters).toContain(id);
      expect(pro.has(id)).toBe(true);
      expect(free.has(id)).toBe(false);
    }
  });

  it('a free caller (default entitlement) is refused with EntitlementError', () => {
    const r = registry();
    const parsed = parse('ABC'); // bytes 41 42 43
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'hex', id, parsed)).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the C-array + base64 exporters', () => {
    const r = registry();
    const parsed = parse('ABC'); // 0x41 0x42 0x43 → base64 "QUJD"

    const carray = String(runExporter(r, 'hex', 'hex.export.c-array', parsed, PRO).body);
    expect(carray).toContain('unsigned char data[] = {');
    expect(carray).toContain('0x41, 0x42, 0x43');
    expect(carray).toContain('data_len = 3;');

    const b64 = String(runExporter(r, 'hex', 'hex.export.base64', parsed, PRO).body);
    expect(b64).toBe('QUJD');
  });

  it('a truly unknown exporter id still throws "unknown exporter"', () => {
    expect(() =>
      runExporter(registry(), 'hex', 'hex.export.nope', { artifacts: [], diagnostics: [] }, PRO),
    ).toThrow(/unknown exporter/);
  });
});

describe('NekoHex: text mode', () => {
  it('dumps ASCII text to hex + ascii', () => {
    const v = report('ABC');
    expect(v.mode).toBe('text');
    expect(v.byteLength).toBe(3);
    expect(v.hex).toBe('414243');
    expect(v.ascii).toBe('ABC');
    expect(v.rows[0]!.offset).toBe('00000000');
  });

  it('UTF-8 encodes multibyte characters', () => {
    expect(report('é').hex).toBe('C3A9');
    expect(report('é').byteLength).toBe(2);
  });

  it('renders non-printable bytes as "." in ASCII', () => {
    expect(report('a\tb').ascii).toBe('a.b');
  });

  it('wraps at 16 bytes per row', () => {
    const v = report('0123456789ABCDEFGHIJ'); // 20 bytes
    expect(v.rows).toHaveLength(2);
    expect(v.rows[1]!.offset).toBe('00000010');
  });
});

describe('NekoHex: hex mode', () => {
  it('decodes a hex string to bytes/ascii', () => {
    const v = report('48 65 6C 6C 6F', 'hex');
    expect(v.mode).toBe('hex');
    expect(v.byteLength).toBe(5);
    expect(v.ascii).toBe('Hello');
  });

  it('ignores 0x prefixes and separators', () => {
    expect(report('0x48,0x69', 'hex').ascii).toBe('Hi');
  });

  it('emits hex.odd_length for an odd number of digits', () => {
    expect(parse('abc', 'hex').diagnostics.find((d) => d.code === 'hex.odd_length')?.severity).toBe('error');
    expect(report('abc', 'hex').valid).toBe(false);
  });

  it('emits hex.invalid for non-hex characters', () => {
    expect(parse('zz', 'hex').diagnostics.find((d) => d.code === 'hex.invalid')?.severity).toBe('error');
  });

  it('decodeHex helper round-trips with bytesToHex semantics', () => {
    expect([...decodeHex('FF00').bytes]).toEqual([255, 0]);
    expect(dumpRows(textToBytes('A'))[0]!.ascii).toBe('A');
  });
});

describe('NekoHex: diagnostics + artifact', () => {
  it('emits hex.empty_input for empty input', () => {
    expect(parse('').diagnostics.map((d) => d.code)).toContain('hex.empty_input');
  });
  it('produces a schema-valid artifact', () => {
    expect(validate('artifact', parse('hello').artifacts[0] as Artifact).ok).toBe(true);
  });
});

describe('NekoHex: exporters', () => {
  it('hex.export.normalized renders the dump block', () => {
    const out = runExporter(registry(), 'hex', 'hex.export.normalized', {
      artifacts: parse('Hi').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toContain('00000000');
    expect(String(out.body)).toContain('|Hi|');
  });
  it('hex.export.markdown.summary reports byte count', () => {
    const out = runExporter(registry(), 'hex', 'hex.export.markdown.summary', {
      artifacts: parse('Hi').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toContain('# NekoHex export');
    expect(String(out.body)).toContain('bytes: 2');
  });
  it('refuses a foreign artifact kind', () => {
    const foreign = { ...(parse('a').artifacts[0] as Artifact), kind: 'json.value' } as Artifact;
    expect(() =>
      runExporter(registry(), 'hex', 'hex.export.json', { artifacts: [foreign], diagnostics: [] }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoHex: workspace round-trip', () => {
  it('round-trips losslessly', () => {
    const parsed = parse('Hello, hex!');
    const ws: Workspace = {
      version: 1,
      id: 'ws_hex_single',
      toolId: 'hex',
      toolVersion: 1,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { mode: 'text' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
