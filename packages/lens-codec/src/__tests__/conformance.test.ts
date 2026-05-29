import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

import {
  buildCodecRegistration,
  FIXED_CLOCK,
  codecManifest,
  CODEC_KIND_TRANSFORM,
} from '../index.js';
import type { CodecName, CodecOperation } from '../codecs.js';
import type { CodecTransformArtifact } from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-27T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildCodecRegistration(clock));
  return r;
}

function transform(operation: CodecOperation, codec: CodecName, raw: string) {
  return runParser(registry(), 'codec', 'codec.transform', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
    hints: { operation, codec },
  });
}

function transformOf(
  operation: CodecOperation,
  codec: CodecName,
  raw: string,
): CodecTransformArtifact {
  return transform(operation, codec, raw).artifacts.find(
    (a) => a.kind === CODEC_KIND_TRANSFORM,
  ) as CodecTransformArtifact;
}

const EXPECTED_FREE = [
  'encode.base64',
  'decode.base64',
  'encode.base64url',
  'decode.base64url',
  'encode.url',
  'decode.url',
  'encode.hex',
  'decode.hex',
  'detect.binary',
  'export.text',
  'export.summary.json',
  'export.summary.markdown',
  'copy.output',
  'workspace.save',
];

const PRO_EXPORTER_IDS = ['codec.export.batch.report', 'codec.export.recipe.bundle'];

describe('NekoCodec: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(codecManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy', () => {
    expect(codecManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('declares Pro features even though the free build ships only free ones', () => {
    expect(codecManifest.entitlements.pro.length).toBeGreaterThan(0);
    expect(codecManifest.entitlements.free).toContain('encode.base64');
  });

  it('declares hashing + encryption as explicitly out of scope', () => {
    expect(codecManifest.outOfScope.some((s) => /hashing/i.test(s))).toBe(true);
    expect(codecManifest.outOfScope.some((s) => /encrypt/i.test(s))).toBe(true);
  });

  it('capabilities reflect current-build truth (no diff, no graph)', () => {
    expect(codecManifest.capabilities.canSaveWorkspace).toBe(true);
    expect(codecManifest.capabilities.canExport).toBe(true);
    expect(codecManifest.capabilities.canDiff).toBe(false);
    expect(codecManifest.capabilities.canProjectGraph).toBe(false);
  });
});

describe('NekoCodec: monetization safety', () => {
  const registration = buildCodecRegistration(clock);

  it('no Pro exporter is registered in the free build', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of PRO_EXPORTER_IDS) expect(registered.has(id)).toBe(false);
  });

  it('registers no graph projector', () => {
    expect(registration.graphProjectors ?? []).toHaveLength(0);
  });

  it('runExporter throws "unknown exporter" for every Pro exporter id', () => {
    const r = registry();
    for (const id of PRO_EXPORTER_IDS) {
      expect(() => runExporter(r, 'codec', id, { artifacts: [], diagnostics: [] })).toThrow(
        /unknown exporter/,
      );
    }
  });

  it('the manifest declares Pro exporters that are NOT in the registered set', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of PRO_EXPORTER_IDS) {
      expect(codecManifest.exporters).toContain(id);
      expect(registered.has(id)).toBe(false);
    }
  });

  it('free entitlements match exactly the implemented set', () => {
    expect(new Set(codecManifest.entitlements.free)).toEqual(new Set(EXPECTED_FREE));
  });
});

describe('NekoCodec: codec.transform parser', () => {
  it('defaults to encode/base64 when hints are missing', () => {
    const result = runParser(registry(), 'codec', 'codec.transform', {
      raw: 'hello',
      source: { kind: 'paste', bytes: 5 },
    });
    const art = result.artifacts[0] as CodecTransformArtifact;
    expect(art.value.operation).toBe('encode');
    expect(art.value.codec).toBe('base64');
    expect(art.value.output).toBe('aGVsbG8=');
  });

  it('Base64 encode/decode round-trips known vectors', () => {
    expect(transformOf('encode', 'base64', 'hello').value.output).toBe('aGVsbG8=');
    expect(transformOf('decode', 'base64', 'aGVsbG8=').value.output).toBe('hello');
  });

  it('Base64URL drops padding, avoids + / =, and round-trips', () => {
    expect(transformOf('encode', 'base64url', 'hello').value.output).toBe('aGVsbG8');
    // '???>>>' would use + or / in the standard alphabet; the URL form must
    // round-trip via - and _ and never emit + / =.
    const enc = transformOf('encode', 'base64url', '???>>>').value.output ?? '';
    expect(enc).not.toMatch(/[+/=]/);
    expect(transformOf('decode', 'base64url', enc).value.output).toBe('???>>>');
  });

  it('URL encode/decode round-trips and percent-escapes reserved characters', () => {
    expect(transformOf('encode', 'url', 'a b&c=d').value.output).toBe('a%20b%26c%3Dd');
    expect(transformOf('decode', 'url', 'a%20b%26c%3Dd').value.output).toBe('a b&c=d');
  });

  it('Hex encode/decode round-trips and tolerates whitespace between pairs', () => {
    expect(transformOf('encode', 'hex', 'hi').value.output).toBe('6869');
    expect(transformOf('decode', 'hex', '6869').value.output).toBe('hi');
    expect(transformOf('decode', 'hex', '68 69').value.output).toBe('hi');
  });

  it('round-trips multi-byte UTF-8 through every codec (encode then decode)', () => {
    const original = 'Néko 🐱 café — 日本語';
    for (const codec of ['base64', 'base64url', 'url', 'hex'] as const) {
      const enc = transformOf('encode', codec, original);
      expect(enc.value.ok, codec).toBe(true);
      const dec = transformOf('decode', codec, enc.value.output ?? '');
      expect(dec.value.output, codec).toBe(original);
    }
  });

  it('emits codec.invalid_base64 (error, null output) without throwing', () => {
    const call = () => transform('decode', 'base64', 'not base64!!');
    expect(call).not.toThrow();
    const result = call();
    expect(result.diagnostics.find((d) => d.code === 'codec.invalid_base64')?.severity).toBe(
      'error',
    );
    const art = result.artifacts.find(
      (a) => a.kind === CODEC_KIND_TRANSFORM,
    ) as CodecTransformArtifact;
    expect(art.value.output).toBeNull();
    expect(art.value.ok).toBe(false);
  });

  it('emits codec.invalid_base64url (error) on non-URL-alphabet input', () => {
    expect(
      transform('decode', 'base64url', 'abc$$').diagnostics.find(
        (d) => d.code === 'codec.invalid_base64url',
      )?.severity,
    ).toBe('error');
  });

  it('emits codec.invalid_hex (error) on non-hex and odd-length input', () => {
    expect(
      transform('decode', 'hex', 'zz').diagnostics.find((d) => d.code === 'codec.invalid_hex')
        ?.severity,
    ).toBe('error');
    expect(
      transform('decode', 'hex', 'abc').diagnostics.find((d) => d.code === 'codec.invalid_hex')
        ?.severity,
    ).toBe('error');
  });

  it('emits codec.invalid_percent_encoding (error) on malformed escapes', () => {
    expect(
      transform('decode', 'url', '%').diagnostics.find(
        (d) => d.code === 'codec.invalid_percent_encoding',
      )?.severity,
    ).toBe('error');
    expect(
      transform('decode', 'url', '%ZZ').diagnostics.find(
        (d) => d.code === 'codec.invalid_percent_encoding',
      )?.severity,
    ).toBe('error');
  });

  it('warns codec.binary_output (warning) when a decode yields binary-looking bytes', () => {
    // "AAEC" is Base64 for bytes [0, 1, 2] — a NUL plus control bytes.
    const result = transform('decode', 'base64', 'AAEC');
    expect(result.diagnostics.find((d) => d.code === 'codec.binary_output')?.severity).toBe(
      'warning',
    );
    const art = result.artifacts.find(
      (a) => a.kind === CODEC_KIND_TRANSFORM,
    ) as CodecTransformArtifact;
    expect(art.value.looksBinary).toBe(true);
    expect(art.value.ok).toBe(true);
  });

  it('emits codec.empty_input (info) for empty input and still produces an artifact', () => {
    const result = transform('encode', 'base64', '');
    expect(result.artifacts.find((a) => a.kind === CODEC_KIND_TRANSFORM)).toBeDefined();
    expect(result.diagnostics.find((d) => d.code === 'codec.empty_input')?.severity).toBe('info');
  });

  it('emits codec.large_document (info) above the soft threshold', () => {
    const r = new ToolRegistry();
    r.register(buildCodecRegistration(clock, { largeDocumentBytes: 4 }));
    const result = runParser(r, 'codec', 'codec.transform', {
      raw: 'hello world',
      source: { kind: 'paste', bytes: 11 },
      hints: { operation: 'encode', codec: 'base64' },
    });
    expect(result.diagnostics.find((d) => d.code === 'codec.large_document')?.severity).toBe(
      'info',
    );
  });

  it('produces a codec.transform artifact that validates against the artifact schema', () => {
    const art = transformOf('encode', 'base64', 'a: 1');
    const validation = validate('artifact', art);
    expect(validation.ok, validation.errors.join('; ')).toBe(true);
  });
});

describe('NekoCodec: exporters', () => {
  it('codec.export.text emits the transformed output verbatim', () => {
    const out = runExporter(registry(), 'codec', 'codec.export.text', {
      artifacts: [transformOf('encode', 'base64', 'hello')],
      diagnostics: [],
    });
    expect(String(out.body)).toBe('aGVsbG8=');
    expect(out.extension).toBe('txt');
  });

  it('codec.export.summary.json emits a machine-readable summary', () => {
    const out = runExporter(registry(), 'codec', 'codec.export.summary.json', {
      artifacts: [transformOf('encode', 'hex', 'hi')],
      diagnostics: [],
    });
    expect(JSON.parse(String(out.body))).toMatchObject({
      operation: 'encode',
      codec: 'hex',
      ok: true,
      output: '6869',
    });
  });

  it('codec.export.summary.markdown describes the transform + diagnostics', () => {
    const out = runExporter(registry(), 'codec', 'codec.export.summary.markdown', {
      artifacts: [transformOf('encode', 'base64', 'hi')],
      diagnostics: [
        { version: 1, id: 'd1', severity: 'info', code: 'codec.test', message: 'sample' },
      ],
    });
    const body = String(out.body);
    expect(body).toContain('# NekoCodec export');
    expect(body).toContain('codec** — base64');
    expect(body).toContain('sample');
  });

  it('a codec exporter refuses a foreign artifact kind (runtime enforces accepts)', () => {
    const foreign = {
      version: 1,
      kind: 'json.document',
      id: 'x',
      producedBy: { toolId: 'json', parserId: 'json.text', parserVersion: 1 },
      producedAt: '2026-05-27T00:00:00.000Z',
      source: { kind: 'paste', bytes: 0 },
      value: {},
    } as Artifact;
    expect(() =>
      runExporter(registry(), 'codec', 'codec.export.text', {
        artifacts: [foreign],
        diagnostics: [],
      }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoCodec: workspace round-trip', () => {
  it('a codec workspace round-trips losslessly', () => {
    const parsed = transform('encode', 'base64', 'hello');
    const ws: Workspace = {
      version: 1,
      id: 'ws_codec',
      toolId: 'codec',
      toolVersion: 1,
      createdAt: '2026-05-27T00:00:00.000Z',
      updatedAt: '2026-05-27T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { operation: 'encode', codec: 'base64' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});

describe('NekoCodec: dependency isolation', () => {
  it('declares no external runtime dependency (everything is workspace:*)', () => {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const deps = pkg.dependencies ?? {};
    const external = Object.entries(deps)
      .filter(([, spec]) => !spec.startsWith('workspace:'))
      .map(([name]) => name);
    expect(external, `unexpected external deps: ${external.join(', ')}`).toEqual([]);
  });
});
