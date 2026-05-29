import { describe, expect, it } from 'vitest';
import type { Workspace } from '@nekotools/contracts';
import {
  ToolRegistry,
  jsonWorkspaceSerializer,
  runExporter,
  runParser,
  validateManifest,
} from '@nekotools/tool-runtime';
import { validate } from '@nekotools/schemas';

import {
  buildHashRegistration,
  digestBytes,
  digestText,
  utf8Encode,
  FIXED_CLOCK,
  hashManifest,
  HASH_KIND_INPUT,
  type HashDigestArtifact,
  type HashInputArtifact,
} from '../index.js';

const clock = FIXED_CLOCK('2026-05-27T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildHashRegistration(clock));
  return r;
}

/** Canonical NIST test vectors for the message "abc" and the empty string. */
const VECTORS = {
  'SHA-256': {
    abc: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    empty: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  },
  'SHA-384':
    'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
  'SHA-512':
    'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
} as const;

/** Decode a base64 string to lowercase hex — lets a test verify the
 * `base64` field is a correct encoding of the same digest as `hex`
 * without hardcoding a second constant. */
function base64ToHex(b64: string): string {
  const binary = atob(b64);
  let hex = '';
  for (let i = 0; i < binary.length; i += 1) {
    hex += binary.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return hex;
}

async function digestArtifactOf(algorithm: string, text: string): Promise<HashDigestArtifact> {
  const { artifacts } = await digestText(algorithm, text, { clock });
  return artifacts[0]!;
}

describe('NekoHash: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(hashManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy', () => {
    expect(hashManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('declares Pro features even though the free build ships only free ones', () => {
    expect(hashManifest.entitlements.pro.length).toBeGreaterThan(0);
    expect(hashManifest.entitlements.free).toContain('hash.compute.text');
  });

  it('declares an out-of-scope list covering HMAC/signatures + KDFs', () => {
    expect(hashManifest.outOfScope.some((s) => /HMAC|signature/i.test(s))).toBe(true);
    expect(hashManifest.outOfScope.some((s) => /bcrypt|scrypt|argon2|PBKDF2/i.test(s))).toBe(true);
  });

  it('capabilities reflect current-build truth (no diff, no graph)', () => {
    expect(hashManifest.capabilities.canSaveWorkspace).toBe(true);
    expect(hashManifest.capabilities.canExport).toBe(true);
    expect(hashManifest.capabilities.canDiff).toBe(false);
    expect(hashManifest.capabilities.canProjectGraph).toBe(false);
  });
});

describe('NekoHash: monetization safety', () => {
  const registration = buildHashRegistration(clock);
  const proExporterIds = ['hash.export.manifest', 'hash.export.checksum.profile'];

  it('no Pro exporter is registered in the free build', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) expect(registered.has(id)).toBe(false);
  });

  it('runExporter throws "unknown exporter" for every Pro exporter id', () => {
    const r = registry();
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'hash', id, { artifacts: [], diagnostics: [] })).toThrow(
        /unknown exporter/,
      );
    }
  });

  it('the manifest declares Pro exporters that are NOT in the registered set', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) {
      expect(hashManifest.exporters).toContain(id);
      expect(registered.has(id)).toBe(false);
    }
  });

  it('free entitlements match exactly the implemented vertical-slice set', () => {
    const expectedFree = new Set([
      'hash.compute.text',
      'hash.compute.file',
      'algorithm.sha256',
      'algorithm.sha384',
      'algorithm.sha512',
      'digest.hex',
      'digest.base64',
      'export.digest',
      'export.json.summary',
      'export.markdown.summary',
    ]);
    expect(new Set(hashManifest.entitlements.free)).toEqual(expectedFree);
  });
});

describe('NekoHash: digest (known vectors)', () => {
  it('SHA-256 of "abc" matches the known vector', async () => {
    const d = await digestArtifactOf('SHA-256', 'abc');
    expect(d.value.hex).toBe(VECTORS['SHA-256'].abc);
    expect(d.value.algorithm).toBe('SHA-256');
    expect(d.value.inputBytes).toBe(3);
    expect(base64ToHex(d.value.base64)).toBe(d.value.hex);
  });

  it('SHA-384 of "abc" matches the known vector', async () => {
    const d = await digestArtifactOf('SHA-384', 'abc');
    expect(d.value.hex).toBe(VECTORS['SHA-384']);
    expect(d.value.algorithm).toBe('SHA-384');
    expect(base64ToHex(d.value.base64)).toBe(d.value.hex);
  });

  it('SHA-512 of "abc" matches the known vector', async () => {
    const d = await digestArtifactOf('SHA-512', 'abc');
    expect(d.value.hex).toBe(VECTORS['SHA-512']);
    expect(d.value.algorithm).toBe('SHA-512');
    expect(base64ToHex(d.value.base64)).toBe(d.value.hex);
  });

  it('empty input still produces the SHA-256 digest of zero bytes', async () => {
    const d = await digestArtifactOf('SHA-256', '');
    expect(d.value.hex).toBe(VECTORS['SHA-256'].empty);
    expect(d.value.inputBytes).toBe(0);
  });

  it('unsupported algorithm yields an error diagnostic and no artifact (no throw)', async () => {
    const call = () => digestText('MD5', 'abc', { clock });
    await expect(call()).resolves.toBeDefined();
    const { artifacts, diagnostics } = await call();
    expect(artifacts).toHaveLength(0);
    expect(diagnostics[0]?.code).toBe('hash.unsupported_algorithm');
    expect(diagnostics[0]?.severity).toBe('error');
  });

  it('honors an injected subtle digester (the UI-test seam)', async () => {
    const fixed = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const subtle = {
      digest: async (): Promise<ArrayBuffer> => fixed.buffer.slice(0),
    };
    const { artifacts } = await digestBytes('SHA-256', utf8Encode('ignored'), { clock, subtle });
    expect(artifacts[0]!.value.hex).toBe('deadbeef');
  });

  it('produces a hash.digest artifact that validates against the artifact schema', async () => {
    const { artifacts } = await digestBytes('SHA-256', utf8Encode('abc'), { clock }, {
      kind: 'derived',
      from: ['art_1'],
    });
    expect(artifacts).toHaveLength(1);
    const validation = validate('artifact', artifacts[0]);
    expect(validation.ok, validation.errors.join('; ')).toBe(true);
  });
});

describe('NekoHash: hash.text parser (synchronous ingest)', () => {
  it('captures the UTF-8 byte length and emits no diagnostic for normal input', () => {
    const result = runParser(registry(), 'hash', 'hash.text', {
      raw: 'abc',
      source: { kind: 'paste', bytes: 3 },
    });
    const input = result.artifacts.find(
      (a) => a.kind === HASH_KIND_INPUT,
    ) as HashInputArtifact;
    expect(input.value.byteLength).toBe(3);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('emits hash.empty_input (info) for empty input and still produces an artifact', () => {
    const result = runParser(registry(), 'hash', 'hash.text', {
      raw: '',
      source: { kind: 'paste', bytes: 0 },
    });
    expect(result.artifacts.find((a) => a.kind === HASH_KIND_INPUT)).toBeDefined();
    expect(result.diagnostics.find((d) => d.code === 'hash.empty_input')?.severity).toBe('info');
  });

  it('measures multi-byte UTF-8 length (not UTF-16 code units)', () => {
    const result = runParser(registry(), 'hash', 'hash.text', {
      raw: '€',
      source: { kind: 'paste', bytes: 3 },
    });
    const input = result.artifacts[0] as HashInputArtifact;
    expect(input.value.byteLength).toBe(3);
  });

  it('emits hash.large_input (info) above the soft threshold', () => {
    const r = new ToolRegistry();
    r.register(buildHashRegistration(clock, { largeInputBytes: 2 }));
    const result = runParser(r, 'hash', 'hash.text', {
      raw: 'abcdef',
      source: { kind: 'paste', bytes: 6 },
    });
    expect(result.diagnostics.find((d) => d.code === 'hash.large_input')?.severity).toBe('info');
  });
});

describe('NekoHash: exporters', () => {
  it('hash.export.digest emits the raw hex digest', async () => {
    const out = runExporter(registry(), 'hash', 'hash.export.digest', {
      artifacts: [await digestArtifactOf('SHA-256', 'abc')],
      diagnostics: [],
    });
    expect(String(out.body)).toBe(VECTORS['SHA-256'].abc);
  });

  it('hash.export.json emits a structured summary', async () => {
    const out = runExporter(registry(), 'hash', 'hash.export.json', {
      artifacts: [await digestArtifactOf('SHA-256', 'abc')],
      diagnostics: [],
    });
    const parsed = JSON.parse(String(out.body)) as Record<string, unknown>;
    expect(parsed.algorithm).toBe('SHA-256');
    expect(parsed.hex).toBe(VECTORS['SHA-256'].abc);
    expect(parsed.inputBytes).toBe(3);
  });

  it('hash.export.markdown.summary describes the digest + diagnostics', async () => {
    const out = runExporter(registry(), 'hash', 'hash.export.markdown.summary', {
      artifacts: [await digestArtifactOf('SHA-256', 'abc')],
      diagnostics: [
        { version: 1, id: 'd1', severity: 'info', code: 'hash.empty_input', message: 'sample' },
      ],
    });
    const body = String(out.body);
    expect(body).toContain('# NekoHash digest');
    expect(body).toContain('SHA-256');
    expect(body).toContain('sample');
  });

  it('digest exporters refuse a hash.input artifact (runtime enforces accepts)', () => {
    const r = registry();
    const inputArtifact = runParser(r, 'hash', 'hash.text', {
      raw: 'abc',
      source: { kind: 'paste', bytes: 3 },
    }).artifacts[0]!;
    for (const id of ['hash.export.digest', 'hash.export.json', 'hash.export.markdown.summary']) {
      expect(() =>
        runExporter(r, 'hash', id, { artifacts: [inputArtifact], diagnostics: [] }),
      ).toThrow(/does not accept artifact kind/);
    }
  });
});

describe('NekoHash: workspace round-trip', () => {
  it('a digest workspace round-trips losslessly', async () => {
    const digest = await digestArtifactOf('SHA-256', 'abc');
    const ws: Workspace = {
      version: 1,
      id: 'ws_hash',
      toolId: 'hash',
      toolVersion: 1,
      createdAt: '2026-05-27T00:00:00.000Z',
      updatedAt: '2026-05-27T00:00:00.000Z',
      artifacts: [digest],
      diagnostics: [],
      uiState: { algorithm: 'SHA-256' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
