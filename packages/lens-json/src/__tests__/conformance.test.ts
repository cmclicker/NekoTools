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
  FIXED_CLOCK,
  buildJsonRegistration,
  inferBasicSchema,
  jsonManifest,
  listPaths,
  parsePointer,
} from '../index.js';
import type { JsonDocumentArtifact, JsonPathResult } from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-20T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildJsonRegistration(clock));
  return r;
}

describe('NekoJSON: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(jsonManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy', () => {
    expect(jsonManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('declares Pro features (advertising) even though free build only ships free ones', () => {
    expect(jsonManifest.entitlements.pro.length).toBeGreaterThan(0);
    expect(jsonManifest.entitlements.free).toContain('parse');
  });

  it('declares an explicit out-of-scope list', () => {
    expect(jsonManifest.outOfScope.length).toBeGreaterThan(0);
    expect(jsonManifest.outOfScope.some((s) => s.includes('$ref'))).toBe(true);
  });
});

describe('NekoJSON: json.text parser', () => {
  it('parses an object document', () => {
    const r = registry();
    const result = runParser(r, 'json', 'json.text', {
      raw: '{"a":1,"b":[2,3]}',
      source: { kind: 'paste', bytes: 17 },
    });
    expect(result.artifacts).toHaveLength(1);
    expect(result.diagnostics).toHaveLength(0);
    expect((result.artifacts[0] as JsonDocumentArtifact).value).toEqual({ a: 1, b: [2, 3] });
  });

  it('emits a diagnostic for empty input', () => {
    const r = registry();
    const result = runParser(r, 'json', 'json.text', {
      raw: '   ',
      source: { kind: 'paste', bytes: 3 },
    });
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe('json.empty_input');
  });

  it('emits a diagnostic for invalid JSON, with a span when V8 reports a position', () => {
    const r = registry();
    const result = runParser(r, 'json', 'json.text', {
      raw: '{"a":',
      source: { kind: 'paste', bytes: 5 },
    });
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe('json.syntax_error');
    // span is best-effort; we tolerate its absence on runtimes that omit "position N".
    if (result.diagnostics[0]?.span) {
      expect(result.diagnostics[0].span.startOffset).toBeGreaterThanOrEqual(0);
    }
  });

  it('parses primitive root values too', () => {
    const r = registry();
    const result = runParser(r, 'json', 'json.text', {
      raw: '42',
      source: { kind: 'paste', bytes: 2 },
    });
    expect((result.artifacts[0] as JsonDocumentArtifact).value).toBe(42);
  });
});

describe('NekoJSON: json.pointer parser', () => {
  const document = { a: { b: [10, 20, { c: 'hit' }] } };

  it('resolves the root pointer', () => {
    const r = registry();
    const result = runParser(r, 'json', 'json.pointer', {
      raw: '',
      source: { kind: 'paste', bytes: 0 },
      hints: { document, documentArtifactId: 'doc_1' },
    });
    const path = result.artifacts[0]!.value as JsonPathResult;
    expect(path.resolved).toBe(true);
    expect(path.value).toEqual(document);
  });

  it('resolves a deep pointer', () => {
    const r = registry();
    const result = runParser(r, 'json', 'json.pointer', {
      raw: '/a/b/2/c',
      source: { kind: 'paste', bytes: 8 },
      hints: { document, documentArtifactId: 'doc_1' },
    });
    const path = result.artifacts[0]!.value as JsonPathResult;
    expect(path.resolved).toBe(true);
    expect(path.value).toBe('hit');
  });

  it('emits a diagnostic for an unresolved pointer', () => {
    const r = registry();
    const result = runParser(r, 'json', 'json.pointer', {
      raw: '/a/missing',
      source: { kind: 'paste', bytes: 10 },
      hints: { document, documentArtifactId: 'doc_1' },
    });
    const path = result.artifacts[0]!.value as JsonPathResult;
    expect(path.resolved).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('json.pointer.unresolved');
  });

  it('emits a diagnostic for a syntactically invalid pointer', () => {
    const r = registry();
    const result = runParser(r, 'json', 'json.pointer', {
      raw: 'no-leading-slash',
      source: { kind: 'paste', bytes: 16 },
      hints: { document, documentArtifactId: 'doc_1' },
    });
    expect(result.diagnostics[0]?.code).toBe('json.pointer.invalid');
  });

  it('decodes ~1 and ~0 escapes per RFC 6901', () => {
    const escapedDoc = { 'a/b': { '~c': 'leaf' } };
    const r = registry();
    const result = runParser(r, 'json', 'json.pointer', {
      raw: '/a~1b/~0c',
      source: { kind: 'paste', bytes: 9 },
      hints: { document: escapedDoc, documentArtifactId: 'doc_1' },
    });
    const path = result.artifacts[0]!.value as JsonPathResult;
    expect(path.resolved).toBe(true);
    expect(path.value).toBe('leaf');
  });
});

describe('NekoJSON: parsePointer helper', () => {
  it('returns empty token list for root', () => {
    const result = parsePointer('');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tokens).toEqual([]);
  });

  it('rejects a pointer without leading slash', () => {
    expect(parsePointer('foo').ok).toBe(false);
  });
});

describe('NekoJSON: basic schema inference', () => {
  it('infers a simple object schema with required keys', () => {
    const schema = inferBasicSchema({ name: 'cody', age: 30 });
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['name', 'age']);
    expect(schema.properties?.['name']?.type).toBe('string');
    expect(schema.properties?.['age']?.type).toBe('integer');
  });

  it('distinguishes integer from number', () => {
    expect(inferBasicSchema(1).type).toBe('integer');
    expect(inferBasicSchema(1.5).type).toBe('number');
  });

  it('handles empty arrays without an items field', () => {
    const schema = inferBasicSchema([]);
    expect(schema.type).toBe('array');
    expect(schema.items).toBeUndefined();
  });

  it('infers array items from the first element only (basic tier)', () => {
    const schema = inferBasicSchema([1, 'mixed']);
    expect(schema.items?.type).toBe('integer');
  });
});

describe('NekoJSON: path listing', () => {
  it('enumerates every JSON Pointer path in a tree', () => {
    const paths = listPaths({ a: { b: [1, 2] } });
    const pointers = paths.map((p) => p.pointer);
    expect(pointers).toContain('');
    expect(pointers).toContain('/a');
    expect(pointers).toContain('/a/b');
    expect(pointers).toContain('/a/b/0');
    expect(pointers).toContain('/a/b/1');
  });

  it('encodes ~ and / in keys per RFC 6901', () => {
    const paths = listPaths({ 'a/b': 1, '~c': 2 });
    const pointers = paths.map((p) => p.pointer);
    expect(pointers).toContain('/a~1b');
    expect(pointers).toContain('/~0c');
  });
});

describe('NekoJSON: exporters', () => {
  function docFromParse(raw: string): readonly JsonDocumentArtifact[] {
    const r = registry();
    const result = runParser(r, 'json', 'json.text', {
      raw,
      source: { kind: 'paste', bytes: raw.length },
    });
    return result.artifacts as readonly JsonDocumentArtifact[];
  }

  it('json.pretty emits 2-space-indented JSON', () => {
    const r = registry();
    const out = runExporter(r, 'json', 'json.export.json.pretty', {
      artifacts: docFromParse('{"a":1}'),
      diagnostics: [],
    });
    expect(String(out.body)).toContain('\n  "a"');
  });

  it('json.minified emits compact JSON', () => {
    const r = registry();
    const out = runExporter(r, 'json', 'json.export.json.minified', {
      artifacts: docFromParse('{"a":1}'),
      diagnostics: [],
    });
    expect(String(out.body)).toBe('{"a":1}');
  });

  it('markdown.summary mentions top-level shape and diagnostics', () => {
    const r = registry();
    const parsed = runParser(r, 'json', 'json.text', {
      raw: '{"a":1,"b":2}',
      source: { kind: 'paste', bytes: 13 },
    });
    const out = runExporter(r, 'json', 'json.export.markdown.summary', {
      artifacts: parsed.artifacts,
      diagnostics: [
        {
          version: 1,
          id: 'd1',
          severity: 'warning',
          code: 'json.test',
          message: 'sample diagnostic',
        },
      ],
    });
    const body = String(out.body);
    expect(body).toContain('object (2 keys)');
    expect(body).toContain('sample diagnostic');
  });

  it('plaintext.paths emits one row per pointer', () => {
    const r = registry();
    const out = runExporter(r, 'json', 'json.export.plaintext.paths', {
      artifacts: docFromParse('{"a":{"b":1}}'),
      diagnostics: [],
    });
    const lines = String(out.body).split('\n');
    expect(lines).toContain('(root)\tobject');
    expect(lines).toContain('/a\tobject');
    // `paths.ts` reports JSON wire types; the integer/number refinement
    // lives in schema-infer, not in path listing.
    expect(lines).toContain('/a/b\tnumber');
  });

  it('schema.json-schema emits a valid-shape inferred schema', () => {
    const r = registry();
    const out = runExporter(r, 'json', 'json.export.schema.json-schema', {
      artifacts: docFromParse('{"name":"cody","age":30}'),
      diagnostics: [],
    });
    const parsed = JSON.parse(String(out.body)) as {
      type?: string;
      properties?: Record<string, { type?: string }>;
    };
    expect(parsed.type).toBe('object');
    expect(parsed.properties?.['name']?.type).toBe('string');
  });

  it('refuses to export an unsupported artifact kind', () => {
    const r = registry();
    expect(() =>
      runExporter(r, 'json', 'json.export.plaintext.paths', {
        artifacts: [
          {
            version: 1,
            kind: 'binary.number',
            id: 'x',
            producedBy: { toolId: 'binary', parserId: 'binary.decimal', parserVersion: 1 },
            producedAt: '2026-05-20T00:00:00.000Z',
            source: { kind: 'paste', bytes: 0 },
            value: 0,
          },
        ] as never,
        diagnostics: [],
      }),
    ).toThrow();
  });
});

describe('NekoJSON: workspace round-trip', () => {
  it('saves and loads losslessly', () => {
    const r = registry();
    const parsed = runParser(r, 'json', 'json.text', {
      raw: '{"a":1}',
      source: { kind: 'paste', bytes: 7 },
    });
    const ws: Workspace = {
      version: 1,
      id: 'ws_json_demo',
      toolId: 'json',
      toolVersion: 1,
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { activePath: '/a', viewMode: 'tree' },
    };
    const raw = jsonWorkspaceSerializer.serialize(ws);
    const back = jsonWorkspaceSerializer.deserialize(raw);
    expect(back).toEqual(ws);
  });

  it('the resulting artifact also validates against the artifact schema', () => {
    const r = registry();
    const parsed = runParser(r, 'json', 'json.text', {
      raw: '{"x":1}',
      source: { kind: 'paste', bytes: 7 },
    });
    const result = validate('artifact', parsed.artifacts[0]);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });
});
