import { describe, expect, it } from 'vitest';
import type {
  Exporter,
  Parser,
  ToolManifest,
  Workspace,
} from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';
import {
  ToolRegistry,
  isFeatureAllowed,
  jsonWorkspaceSerializer,
  runExporter,
  runParser,
  validateManifest,
} from '../index.js';

const manifest: ToolManifest = {
  version: 1,
  id: 'test',
  name: 'Test',
  toolVersion: 1,
  summary: 'a test tool',
  artifactKinds: ['test.value'],
  parsers: ['test.parser'],
  exporters: ['test.export'],
  offlinePolicy: DEFAULT_OFFLINE_POLICY,
  capabilities: {
    canSaveWorkspace: true,
    canExport: true,
    canDiff: false,
    canProjectGraph: false,
  },
  entitlements: { free: ['parse'], pro: ['migrate'] },
  outOfScope: [],
};

const parser: Parser = {
  version: 1,
  id: 'test.parser',
  parserVersion: 1,
  toolId: 'test',
  accepts: ['raw'],
  produces: ['test.value'],
  parse(input) {
    if (input.raw === 'throw') throw new Error('boom');
    return {
      artifacts: [
        {
          version: 1,
          kind: 'test.value',
          id: 'art_1',
          producedBy: { toolId: 'test', parserId: 'test.parser', parserVersion: 1 },
          producedAt: '2026-05-19T00:00:00.000Z',
          source: { kind: 'paste', bytes: input.raw.length },
          value: input.raw,
        },
      ],
      diagnostics: [],
    };
  },
};

const exporter: Exporter = {
  version: 1,
  id: 'test.export',
  toolId: 'test',
  target: 'plaintext',
  accepts: ['test.value'],
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export(input) {
    return {
      mimeType: 'text/plain',
      extension: 'txt',
      body: input.artifacts.map((a) => String(a.value)).join('\n'),
    };
  },
};

describe('runtime: registry', () => {
  it('accepts a well-formed registration', () => {
    const r = new ToolRegistry();
    r.register({ manifest, parsers: [parser], exporters: [exporter] });
    expect(r.has('test')).toBe(true);
  });

  it('rejects duplicate registration', () => {
    const r = new ToolRegistry();
    r.register({ manifest, parsers: [parser], exporters: [exporter] });
    expect(() => r.register({ manifest, parsers: [parser], exporters: [exporter] })).toThrow();
  });

  it('rejects a parser whose toolId does not match the manifest', () => {
    const r = new ToolRegistry();
    const stray: Parser = { ...parser, toolId: 'other' };
    expect(() => r.register({ manifest, parsers: [stray], exporters: [exporter] })).toThrow();
  });

  it('rejects an exporter not declared in the manifest', () => {
    const r = new ToolRegistry();
    const stray: Exporter = { ...exporter, id: 'test.unexpected' };
    expect(() => r.register({ manifest, parsers: [parser], exporters: [stray] })).toThrow();
  });

  it('fails closed on a schema-invalid manifest', () => {
    const r = new ToolRegistry();
    const bad: ToolManifest = { ...manifest, name: '' };
    expect(() => r.register({ manifest: bad, parsers: [parser], exporters: [exporter] })).toThrow(
      /invalid manifest/,
    );
  });

  it('fails closed on a cross-field-invalid manifest (free + pro overlap)', () => {
    const r = new ToolRegistry();
    const bad: ToolManifest = {
      ...manifest,
      entitlements: { free: ['parse', 'migrate'], pro: ['migrate'] },
    };
    expect(() => r.register({ manifest: bad, parsers: [parser], exporters: [exporter] })).toThrow(
      /invalid manifest/,
    );
  });
});

describe('runtime: parser runner', () => {
  it('returns artifacts on happy path', () => {
    const r = new ToolRegistry();
    r.register({ manifest, parsers: [parser], exporters: [exporter] });
    const result = runParser(r, 'test', 'test.parser', {
      raw: 'hello',
      source: { kind: 'paste', bytes: 5 },
    });
    expect(result.artifacts).toHaveLength(1);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('converts thrown errors into diagnostics, not crashes', () => {
    const r = new ToolRegistry();
    r.register({ manifest, parsers: [parser], exporters: [exporter] });
    const result = runParser(r, 'test', 'test.parser', {
      raw: 'throw',
      source: { kind: 'paste', bytes: 5 },
    });
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics[0]?.severity).toBe('error');
    expect(result.diagnostics[0]?.code).toBe('runner.parser_threw');
  });

  it('produces a deterministic diagnostic id when a parser throws', () => {
    const r = new ToolRegistry();
    r.register({ manifest, parsers: [parser], exporters: [exporter] });
    const a = runParser(r, 'test', 'test.parser', {
      raw: 'throw',
      source: { kind: 'paste', bytes: 5 },
    });
    const b = runParser(r, 'test', 'test.parser', {
      raw: 'throw',
      source: { kind: 'paste', bytes: 5 },
    });
    expect(a.diagnostics[0]?.id).toBe(b.diagnostics[0]?.id);
    expect(a.diagnostics[0]?.id).toMatch(/^diag_runner_test_parser$/);
  });

  it('lets callers override the diagnostic id factory', () => {
    const r = new ToolRegistry();
    r.register({ manifest, parsers: [parser], exporters: [exporter] });
    let n = 0;
    const result = runParser(
      r,
      'test',
      'test.parser',
      { raw: 'throw', source: { kind: 'paste', bytes: 5 } },
      { diagnosticId: () => `diag_${++n}` },
    );
    expect(result.diagnostics[0]?.id).toBe('diag_1');
  });
});

describe('runtime: export runner', () => {
  it('exports accepted artifact kinds', () => {
    const r = new ToolRegistry();
    r.register({ manifest, parsers: [parser], exporters: [exporter] });
    const parsed = runParser(r, 'test', 'test.parser', {
      raw: 'hello',
      source: { kind: 'paste', bytes: 5 },
    });
    const out = runExporter(r, 'test', 'test.export', {
      artifacts: parsed.artifacts,
      diagnostics: [],
    });
    expect(out.body).toBe('hello');
  });

  it('refuses unsupported artifact kinds', () => {
    const r = new ToolRegistry();
    r.register({ manifest, parsers: [parser], exporters: [exporter] });
    expect(() =>
      runExporter(r, 'test', 'test.export', {
        artifacts: [
          {
            version: 1,
            kind: 'other.kind',
            id: 'x',
            producedBy: { toolId: 'test', parserId: 'test.parser', parserVersion: 1 },
            producedAt: '2026-05-19T00:00:00.000Z',
            source: { kind: 'paste', bytes: 0 },
            value: null,
          },
        ],
        diagnostics: [],
      }),
    ).toThrow();
  });
});

describe('runtime: workspace serializer', () => {
  it('round-trips a valid workspace', () => {
    const ws: Workspace = {
      version: 1,
      id: 'ws_1',
      toolId: 'test',
      toolVersion: 1,
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
      artifacts: [
        {
          version: 1,
          kind: 'test.value',
          id: 'art_1',
          producedBy: { toolId: 'test', parserId: 'test.parser', parserVersion: 1 },
          producedAt: '2026-05-19T00:00:00.000Z',
          source: { kind: 'paste', bytes: 5 },
          value: 'hello',
        },
      ],
      diagnostics: [],
    };
    const raw = jsonWorkspaceSerializer.serialize(ws);
    const back = jsonWorkspaceSerializer.deserialize(raw);
    expect(back).toEqual(ws);
  });

  it('refuses malformed JSON on load', () => {
    expect(() => jsonWorkspaceSerializer.deserialize('{not json')).toThrow();
  });

  it('refuses schema-invalid workspaces on save', () => {
    expect(() =>
      jsonWorkspaceSerializer.serialize({
        version: 1,
        id: 'ws_1',
        toolId: 'test',
        toolVersion: 1,
        createdAt: 'nope',
        updatedAt: '2026-05-19T00:00:00.000Z',
        artifacts: [],
        diagnostics: [],
      } as unknown as Workspace),
    ).toThrow();
  });
});

describe('runtime: manifest validator', () => {
  it('accepts a well-formed manifest', () => {
    expect(validateManifest(manifest).ok).toBe(true);
  });

  it('rejects a feature that is both free and pro', () => {
    const bad: ToolManifest = {
      ...manifest,
      entitlements: { free: ['parse', 'migrate'], pro: ['migrate'] },
    };
    const result = validateManifest(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('migrate'))).toBe(true);
  });
});

describe('runtime: entitlement gate', () => {
  it('allows free features under the free entitlement', () => {
    expect(isFeatureAllowed(manifest, 'parse')).toBe(true);
  });

  it('blocks pro features under the free entitlement', () => {
    expect(isFeatureAllowed(manifest, 'migrate')).toBe(false);
  });

  it('allows pro features when entitlement carries them', () => {
    expect(
      isFeatureAllowed(manifest, 'migrate', {
        version: 1,
        licenseId: 'p1',
        licensee: 'x',
        tier: 'pro',
        features: ['migrate'],
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: null,
        signature: 'sig',
      }),
    ).toBe(true);
  });
});
