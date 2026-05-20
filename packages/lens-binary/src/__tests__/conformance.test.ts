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

import { FIXED_CLOCK, binaryManifest, buildBinaryRegistration } from '../index.js';

const clock = FIXED_CLOCK('2026-05-19T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildBinaryRegistration(clock));
  return r;
}

describe('NekoBinary: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(binaryManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden and no pro features', () => {
    expect(binaryManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
    expect(binaryManifest.entitlements.pro).toEqual([]);
  });

  it('declares an explicit outOfScope', () => {
    expect(binaryManifest.outOfScope.length).toBeGreaterThan(0);
  });
});

describe('NekoBinary: decimal parser', () => {
  it('parses a non-negative decimal', () => {
    const r = registry();
    const result = runParser(r, 'binary', 'binary.decimal', {
      raw: '42',
      source: { kind: 'paste', bytes: 2 },
    });
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.value).toBe(42);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('emits a diagnostic for empty input', () => {
    const r = registry();
    const result = runParser(r, 'binary', 'binary.decimal', {
      raw: '   ',
      source: { kind: 'paste', bytes: 3 },
    });
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe('binary.empty_input');
  });

  it('emits a diagnostic for non-decimal input', () => {
    const r = registry();
    const result = runParser(r, 'binary', 'binary.decimal', {
      raw: '12a',
      source: { kind: 'paste', bytes: 3 },
    });
    expect(result.diagnostics[0]?.code).toBe('binary.invalid_decimal');
  });
});

describe('NekoBinary: binary parser', () => {
  it('parses 0b-prefixed binary', () => {
    const r = registry();
    const result = runParser(r, 'binary', 'binary.binary', {
      raw: '0b1010',
      source: { kind: 'paste', bytes: 6 },
    });
    expect(result.artifacts[0]?.value).toBe(10);
  });

  it('flags invalid binary digits with a span', () => {
    const r = registry();
    const result = runParser(r, 'binary', 'binary.binary', {
      raw: '102',
      source: { kind: 'paste', bytes: 3 },
    });
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe('binary.invalid_digit');
    expect(result.diagnostics[0]?.span?.startOffset).toBe(2);
  });
});

describe('NekoBinary: hex parser', () => {
  it('parses an even-length hex string into bytes', () => {
    const r = registry();
    const result = runParser(r, 'binary', 'binary.hex', {
      raw: '0xCAFEBABE',
      source: { kind: 'paste', bytes: 10 },
    });
    expect(result.artifacts[0]?.value).toBe('cafebabe');
  });

  it('flags odd-length hex', () => {
    const r = registry();
    const result = runParser(r, 'binary', 'binary.hex', {
      raw: 'abc',
      source: { kind: 'paste', bytes: 3 },
    });
    expect(result.diagnostics[0]?.code).toBe('binary.hex_odd_length');
  });

  it('flags invalid hex digits', () => {
    const r = registry();
    const result = runParser(r, 'binary', 'binary.hex', {
      raw: 'zz',
      source: { kind: 'paste', bytes: 2 },
    });
    expect(result.diagnostics[0]?.code).toBe('binary.invalid_hex_digit');
  });
});

describe('NekoBinary: base64 parser', () => {
  it('decodes a clean base64 input', () => {
    const r = registry();
    const result = runParser(r, 'binary', 'binary.base64', {
      raw: 'aGVsbG8=',
      source: { kind: 'paste', bytes: 8 },
    });
    expect(result.artifacts[0]?.value).toBe('68656c6c6f');
  });

  it('warns about missing padding', () => {
    const r = registry();
    const result = runParser(r, 'binary', 'binary.base64', {
      raw: 'aGVsbG8',
      source: { kind: 'paste', bytes: 7 },
    });
    expect(result.diagnostics.some((d) => d.code === 'binary.base64_unsafe_padding')).toBe(true);
  });

  it('rejects characters outside the alphabet', () => {
    const r = registry();
    const result = runParser(r, 'binary', 'binary.base64', {
      raw: 'aGVs!bG8=',
      source: { kind: 'paste', bytes: 9 },
    });
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe('binary.invalid_base64');
  });
});

describe('NekoBinary: utf8 parser', () => {
  it('accepts a plain UTF-8 string', () => {
    const r = registry();
    const result = runParser(r, 'binary', 'binary.utf8', {
      raw: 'hello',
      source: { kind: 'paste', bytes: 5 },
    });
    expect(result.artifacts[0]?.value).toBe('hello');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('warns on non-printable characters', () => {
    const r = registry();
    const result = runParser(r, 'binary', 'binary.utf8', {
      raw: 'ab',
      source: { kind: 'paste', bytes: 3 },
    });
    expect(result.diagnostics.some((d) => d.code === 'binary.non_printable')).toBe(true);
  });
});

describe('NekoBinary: exporters', () => {
  it('JSON export produces parseable JSON and validates against the schema', () => {
    const r = registry();
    const parsed = runParser(r, 'binary', 'binary.decimal', {
      raw: '42',
      source: { kind: 'paste', bytes: 2 },
    });
    const out = runExporter(r, 'binary', 'binary.export.json', {
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
    });
    const decoded = JSON.parse(String(out.body));
    expect(decoded.artifacts).toHaveLength(1);
    expect(validate('artifact', decoded.artifacts[0]).ok).toBe(true);
  });

  it('Markdown export contains the artifact id and value', () => {
    const r = registry();
    const parsed = runParser(r, 'binary', 'binary.decimal', {
      raw: '42',
      source: { kind: 'paste', bytes: 2 },
    });
    const out = runExporter(r, 'binary', 'binary.export.markdown', {
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
    });
    expect(String(out.body)).toContain('42');
    expect(String(out.body)).toContain('binary.number');
  });

  it('Plaintext export produces TSV-ish lines', () => {
    const r = registry();
    const parsed = runParser(r, 'binary', 'binary.decimal', {
      raw: '42',
      source: { kind: 'paste', bytes: 2 },
    });
    const out = runExporter(r, 'binary', 'binary.export.plaintext', {
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
    });
    expect(String(out.body)).toMatch(/binary\.number\tart_\d+\t42/);
  });
});

describe('NekoBinary: workspace round-trip', () => {
  it('saves and loads losslessly', () => {
    const r = registry();
    const parsed = runParser(r, 'binary', 'binary.decimal', {
      raw: '42',
      source: { kind: 'paste', bytes: 2 },
    });
    const ws: Workspace = {
      version: 1,
      id: 'ws_demo',
      toolId: 'binary',
      toolVersion: 1,
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
    };
    const raw = jsonWorkspaceSerializer.serialize(ws);
    const back = jsonWorkspaceSerializer.deserialize(raw);
    expect(back).toEqual(ws);
  });
});
