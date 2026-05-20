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
  canonicalize,
  computeTextualDiff,
  diffLines,
  inferBasicSchema,
  jsonManifest,
  listPaths,
  parsePointer,
} from '../index.js';
import type { JsonDiff, JsonDiffArtifact, JsonDocumentArtifact, JsonPathResult } from '../kinds.js';

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

  it('capabilities reflect current-build truth, not lifetime intent', () => {
    expect(jsonManifest.capabilities.canSaveWorkspace).toBe(true);
    expect(jsonManifest.capabilities.canExport).toBe(true);
    // Phase 1.1a flipped canDiff to true. Graph projection stays false
    // until the Pro build registers a graph projector.
    expect(jsonManifest.capabilities.canDiff).toBe(true);
    expect(jsonManifest.capabilities.canProjectGraph).toBe(false);
  });
});

/**
 * Monetization safety: the free build must not bundle Pro
 * implementations, and the manifest's free entitlements must not
 * advertise features the build cannot actually perform.
 *
 * These tests are the mechanical enforcement of the rule in
 * docs/open-core-strategy.md.
 */
describe('NekoJSON: monetization safety', () => {
  const registration = buildJsonRegistration(clock);

  const proExporterIds = [
    'json.export.types.typescript',
    'json.export.types.zod',
    'json.export.docs.data-dictionary',
  ];

  const proProjectorIds = ['json.graph.references'];

  it('no Pro exporter is registered in the free build', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) {
      expect(registered.has(id)).toBe(false);
    }
  });

  it('no graph projector is registered in the free build', () => {
    const projectors = registration.graphProjectors ?? [];
    expect(projectors).toHaveLength(0);
    for (const id of proProjectorIds) {
      expect(projectors.find((p) => p.id === id)).toBeUndefined();
    }
  });

  it('runExporter throws "unknown exporter" when invoked with a Pro id', () => {
    const r = registry();
    for (const id of proExporterIds) {
      expect(() =>
        runExporter(r, 'json', id, { artifacts: [], diagnostics: [] }),
      ).toThrow(/unknown exporter/);
    }
  });

  it('the manifest declares Pro exporters that are NOT in the registered set', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) {
      expect(jsonManifest.exporters).toContain(id);
      expect(registered.has(id)).toBe(false);
    }
  });

  it('the manifest free entitlements list matches what the build can actually do', () => {
    const expectedFree = new Set([
      'parse',
      'format',
      'minify',
      'validate',
      'inspect.pointer',
      'schema.infer.basic',
      'diff.textual',
      'export.json.pretty',
      'export.json.minified',
      'export.markdown.summary',
      'export.plaintext.paths',
      'export.schema.basic',
      'export.diff.textual',
      'workspace.save',
    ]);
    const declared = new Set(jsonManifest.entitlements.free);
    expect(declared).toEqual(expectedFree);

    // Deferred free features must NOT be declared in the manifest
    // until the implementation lands in the same PR. Phase 1.1a
    // shipped textual diff, so it was removed from this list.
    const deferredFree = [
      'view.tree',
      'view.table',
      'view.text',
      'search',
      'copy.path',
      'copy.value',
    ];
    for (const id of deferredFree) {
      expect(declared.has(id)).toBe(false);
    }
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

  it('Phase 1.1c: syntax_error span comes from the tokenizer for lexical errors (multi-char range)', () => {
    // An unterminated string is a lexical-level break — the tokenizer
    // sees it before JSON.parse does. The diagnostic span should
    // cover the *whole* unterminated literal, not a single position.
    const r = registry();
    const result = runParser(r, 'json', 'json.text', {
      raw: '"unterminated',
      source: { kind: 'paste', bytes: 13 },
    });
    expect(result.diagnostics[0]?.code).toBe('json.syntax_error');
    const span = result.diagnostics[0]?.span;
    expect(span).toBeDefined();
    expect(span?.startOffset).toBe(0);
    expect(span?.endOffset).toBe(13); // the whole unterminated literal
  });

  it('Phase 1.1c: syntax_error span snaps to the containing token for structural errors', () => {
    // `{"a"}` is lexically clean (every individual token is fine).
    // JSON.parse fails on the `}` because it wanted `:`. With the
    // tokenizer wired in, the diagnostic span should be a real token
    // span (multi-character when V8 reports a position inside one).
    const r = registry();
    const result = runParser(r, 'json', 'json.text', {
      raw: '{"a"}',
      source: { kind: 'paste', bytes: 5 },
    });
    expect(result.diagnostics[0]?.code).toBe('json.syntax_error');
    const span = result.diagnostics[0]?.span;
    // We only assert that the span has positive length and lies
    // inside the input — V8 / Node may shift `position N` slightly
    // across releases, so we don't pin the exact offset.
    if (span) {
      expect(span.endOffset).toBeGreaterThan(span.startOffset);
      expect(span.startOffset).toBeGreaterThanOrEqual(0);
      expect(span.endOffset).toBeLessThanOrEqual(5);
    }
  });

  it('PR #6 audit blocker 5: tokenizer-backed syntax_error diagnostics validate against the diagnostic schema', () => {
    // The tokenizer emits spans with line/column fields, which the
    // DiagnosticSpan schema permits. This test exercises that path
    // end-to-end: the runtime-produced diagnostic must be a valid
    // instance of diagnostic.schema.json.
    const r = registry();
    const result = runParser(r, 'json', 'json.text', {
      raw: '"unterminated',
      source: { kind: 'paste', bytes: 13 },
    });
    expect(result.diagnostics[0]?.code).toBe('json.syntax_error');
    const validation = validate('diagnostic', result.diagnostics[0]);
    expect(validation.ok, validation.errors.join('; ')).toBe(true);
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

describe('NekoJSON: large-document soft threshold (Phase 1.1b)', () => {
  function smallThresholdRegistry(threshold: number): ToolRegistry {
    const r = new ToolRegistry();
    r.register(buildJsonRegistration(clock, { largeDocumentBytes: threshold }));
    return r;
  }

  it('does not emit json.large_document for inputs at or under the threshold', () => {
    const r = smallThresholdRegistry(100);
    const result = runParser(r, 'json', 'json.text', {
      raw: '{"a":1}',
      source: { kind: 'paste', bytes: 7 },
    });
    expect(result.diagnostics.find((d) => d.code === 'json.large_document')).toBeUndefined();
  });

  it('emits json.large_document at info severity for inputs above the threshold', () => {
    const r = smallThresholdRegistry(10);
    // 20-char input, threshold 10
    const result = runParser(r, 'json', 'json.text', {
      raw: '{"a":"hello world"}',
      source: { kind: 'paste', bytes: 19 },
    });
    const diag = result.diagnostics.find((d) => d.code === 'json.large_document');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('info');
  });

  it('still produces the parsed artifact when the threshold is exceeded (info, not error)', () => {
    const r = smallThresholdRegistry(5);
    const result = runParser(r, 'json', 'json.text', {
      raw: '{"name":"cody"}',
      source: { kind: 'paste', bytes: 15 },
    });
    expect(result.artifacts).toHaveLength(1);
    expect((result.artifacts[0] as JsonDocumentArtifact).value).toEqual({ name: 'cody' });
  });

  it('the default registration uses the 10 MB threshold (no diagnostic on small input)', () => {
    const r = registry(); // production default registration
    const result = runParser(r, 'json', 'json.text', {
      raw: '{"a":1}',
      source: { kind: 'paste', bytes: 7 },
    });
    expect(result.diagnostics.find((d) => d.code === 'json.large_document')).toBeUndefined();
  });

  it('uses UTF-8 byte length, not JS UTF-16 string length, for non-ASCII input', () => {
    // The raw input is `"é"` — three characters: `"`, `é`, `"`. That
    // is 3 UTF-16 code units but 4 UTF-8 bytes (the `é` itself takes
    // 2 bytes in UTF-8). With threshold = 3:
    //   - JS string length 3 > 3 is FALSE (would not emit; the bug)
    //   - UTF-8 byte length 4 > 3 is TRUE (must emit; the fix)
    const r = smallThresholdRegistry(3);
    const result = runParser(r, 'json', 'json.text', {
      raw: '"é"',
      source: { kind: 'paste', bytes: 4 },
    });
    const diag = result.diagnostics.find((d) => d.code === 'json.large_document');
    expect(diag).toBeDefined();
    expect(diag?.message).toContain('4 bytes');
  });

  it('non-ASCII input under the byte threshold does not emit the diagnostic', () => {
    // Same input as above, but threshold raised to 4 — UTF-8 length
    // 4 is NOT greater than 4. Confirms the boundary is strict `>`.
    const r = smallThresholdRegistry(4);
    const result = runParser(r, 'json', 'json.text', {
      raw: '"é"',
      source: { kind: 'paste', bytes: 4 },
    });
    expect(result.diagnostics.find((d) => d.code === 'json.large_document')).toBeUndefined();
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

describe('NekoJSON: textual diff (Phase 1.1a)', () => {
  it('canonicalize sorts object keys recursively', () => {
    const a = canonicalize({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalize({ a: { c: 3, d: 2 }, b: 1 });
    expect(a).toBe(b);
  });

  it('canonicalize throws TypeError on non-JSON roots (undefined, function, symbol)', () => {
    // Defense-in-depth: the parser is the primary fail-closed
    // boundary, but if a future direct caller hands us a non-JSON
    // value, the function must throw rather than silently return
    // undefined (which it would do if we just returned
    // JSON.stringify's result unchecked).
    expect(() => canonicalize(undefined)).toThrow(TypeError);
    expect(() => canonicalize(() => 1)).toThrow(TypeError);
    expect(() => canonicalize(Symbol('x'))).toThrow(TypeError);
  });

  it('diffLines returns all-equal hunks for identical inputs', () => {
    const hunks = diffLines(['x', 'y'], ['x', 'y']);
    expect(hunks.every((h) => h.kind === 'equal')).toBe(true);
    expect(hunks).toHaveLength(2);
  });

  it('diffLines distinguishes add, remove, and equal', () => {
    const hunks = diffLines(['a', 'b', 'c'], ['a', 'B', 'c']);
    const kinds = hunks.map((h) => h.kind);
    expect(kinds).toContain('equal');
    expect(kinds).toContain('add');
    expect(kinds).toContain('remove');
  });

  it('computeTextualDiff produces a diff artifact ignoring key order', () => {
    const diff = computeTextualDiff('left', 'right', { a: 1, b: 2 }, { b: 2, a: 1 });
    // Canonical form sorts keys, so reordering keys produces no diff.
    expect(diff.hunks.every((h) => h.kind === 'equal')).toBe(true);
  });

  it('computeTextualDiff emits hunks when values actually differ', () => {
    const diff = computeTextualDiff('left', 'right', { name: 'a' }, { name: 'b' });
    expect(diff.hunks.some((h) => h.kind === 'add')).toBe(true);
    expect(diff.hunks.some((h) => h.kind === 'remove')).toBe(true);
  });
});

describe('NekoJSON: json.diff.textual parser', () => {
  function diffArtifact(left: unknown, right: unknown): JsonDiffArtifact {
    const r = registry();
    const result = runParser(r, 'json', 'json.diff.textual', {
      raw: '',
      source: { kind: 'derived', from: ['left_id', 'right_id'] },
      hints: {
        leftArtifactId: 'left_id',
        leftDocument: left,
        rightArtifactId: 'right_id',
        rightDocument: right,
      },
    });
    expect(result.diagnostics).toHaveLength(0);
    expect(result.artifacts).toHaveLength(1);
    return result.artifacts[0] as JsonDiffArtifact;
  }

  it('produces a json.diff artifact with the right shape', () => {
    const art = diffArtifact({ a: 1 }, { a: 1 });
    expect(art.kind).toBe('json.diff');
    expect(art.source).toEqual({ kind: 'derived', from: ['left_id', 'right_id'] });
    const v = art.value as JsonDiff;
    expect(v.leftArtifactId).toBe('left_id');
    expect(v.rightArtifactId).toBe('right_id');
    expect(v.hunks.every((h) => h.kind === 'equal')).toBe(true);
  });

  it('emits a diagnostic when artifact ids are missing', () => {
    const r = registry();
    const result = runParser(r, 'json', 'json.diff.textual', {
      raw: '',
      source: { kind: 'derived', from: [] },
      hints: { leftDocument: { a: 1 }, rightDocument: { a: 2 } },
    });
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe('json.diff.missing_input');
  });

  it('emits a diagnostic when leftDocument hint key is absent (does not throw)', () => {
    const r = registry();
    const call = () =>
      runParser(r, 'json', 'json.diff.textual', {
        raw: '',
        source: { kind: 'derived', from: ['l', 'r'] },
        hints: { leftArtifactId: 'l', rightArtifactId: 'r', rightDocument: { a: 1 } },
      });
    expect(call).not.toThrow();
    const result = call();
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe('json.diff.missing_input');
  });

  it('emits a diagnostic when rightDocument hint key is absent (does not throw)', () => {
    const r = registry();
    const call = () =>
      runParser(r, 'json', 'json.diff.textual', {
        raw: '',
        source: { kind: 'derived', from: ['l', 'r'] },
        hints: { leftArtifactId: 'l', rightArtifactId: 'r', leftDocument: { a: 1 } },
      });
    expect(call).not.toThrow();
    const result = call();
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe('json.diff.missing_input');
  });

  it('emits a diagnostic when leftDocument is explicitly undefined (does not throw)', () => {
    const r = registry();
    const call = () =>
      runParser(r, 'json', 'json.diff.textual', {
        raw: '',
        source: { kind: 'derived', from: ['l', 'r'] },
        hints: {
          leftArtifactId: 'l',
          rightArtifactId: 'r',
          leftDocument: undefined,
          rightDocument: { a: 1 },
        },
      });
    expect(call).not.toThrow();
    const result = call();
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe('json.diff.missing_input');
  });

  it('emits a diagnostic when rightDocument is explicitly undefined (does not throw)', () => {
    const r = registry();
    const call = () =>
      runParser(r, 'json', 'json.diff.textual', {
        raw: '',
        source: { kind: 'derived', from: ['l', 'r'] },
        hints: {
          leftArtifactId: 'l',
          rightArtifactId: 'r',
          leftDocument: { a: 1 },
          rightDocument: undefined,
        },
      });
    expect(call).not.toThrow();
    const result = call();
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe('json.diff.missing_input');
  });

  it('accepts null / 0 as legitimate JSON root values, not "missing"', () => {
    // These are valid JSON roots. The hasOwnProperty presence check
    // exists precisely so a truthy check does not reject them.
    const r = registry();
    const result = runParser(r, 'json', 'json.diff.textual', {
      raw: '',
      source: { kind: 'derived', from: ['l', 'r'] },
      hints: {
        leftArtifactId: 'l',
        rightArtifactId: 'r',
        leftDocument: null,
        rightDocument: 0,
      },
    });
    expect(result.diagnostics).toHaveLength(0);
    expect(result.artifacts).toHaveLength(1);
  });

  it('produced artifact validates against the artifact schema', () => {
    const art = diffArtifact({ a: 1 }, { a: 2 });
    const result = validate('artifact', art);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });
});

describe('NekoJSON: diff exporter', () => {
  function diffArtifact(left: unknown, right: unknown): JsonDiffArtifact {
    const r = registry();
    const result = runParser(r, 'json', 'json.diff.textual', {
      raw: '',
      source: { kind: 'derived', from: ['left_id', 'right_id'] },
      hints: {
        leftArtifactId: 'left_id',
        leftDocument: left,
        rightArtifactId: 'right_id',
        rightDocument: right,
      },
    });
    return result.artifacts[0] as JsonDiffArtifact;
  }

  it('renders a unified-diff-style plaintext block', () => {
    const r = registry();
    const out = runExporter(r, 'json', 'json.export.diff.textual', {
      artifacts: [diffArtifact({ name: 'a' }, { name: 'b' })],
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toContain('--- left_id');
    expect(body).toContain('+++ right_id');
    expect(body).toMatch(/^- /m);
    expect(body).toMatch(/^\+ /m);
    expect(out.extension).toBe('diff');
  });

  it('refuses non-diff artifacts in the input (runtime enforces accepts)', () => {
    const r = registry();
    const docParsed = runParser(r, 'json', 'json.text', {
      raw: '{"a":1}',
      source: { kind: 'paste', bytes: 7 },
    });
    expect(() =>
      runExporter(r, 'json', 'json.export.diff.textual', {
        artifacts: docParsed.artifacts,
        diagnostics: [],
      }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoJSON: exporter accept boundaries (PR #4 audit)', () => {
  function diffArtifact(): JsonDiffArtifact {
    const r = registry();
    const result = runParser(r, 'json', 'json.diff.textual', {
      raw: '',
      source: { kind: 'derived', from: ['l', 'r'] },
      hints: {
        leftArtifactId: 'l',
        leftDocument: { a: 1 },
        rightArtifactId: 'r',
        rightDocument: { a: 2 },
      },
    });
    return result.artifacts[0] as JsonDiffArtifact;
  }

  it('json.export.json.pretty refuses json.diff artifacts', () => {
    const r = registry();
    expect(() =>
      runExporter(r, 'json', 'json.export.json.pretty', {
        artifacts: [diffArtifact()],
        diagnostics: [],
      }),
    ).toThrow(/does not accept artifact kind/);
  });

  it('json.export.json.minified refuses json.diff artifacts', () => {
    const r = registry();
    expect(() =>
      runExporter(r, 'json', 'json.export.json.minified', {
        artifacts: [diffArtifact()],
        diagnostics: [],
      }),
    ).toThrow(/does not accept artifact kind/);
  });

  it('json.export.plaintext.paths refuses json.diff artifacts', () => {
    const r = registry();
    expect(() =>
      runExporter(r, 'json', 'json.export.plaintext.paths', {
        artifacts: [diffArtifact()],
        diagnostics: [],
      }),
    ).toThrow(/does not accept artifact kind/);
  });

  it('json.export.schema.json-schema refuses json.diff artifacts', () => {
    const r = registry();
    expect(() =>
      runExporter(r, 'json', 'json.export.schema.json-schema', {
        artifacts: [diffArtifact()],
        diagnostics: [],
      }),
    ).toThrow(/does not accept artifact kind/);
  });

  it('json.export.markdown.summary accepts json.diff and renders a Diffs section', () => {
    const r = registry();
    const out = runExporter(r, 'json', 'json.export.markdown.summary', {
      artifacts: [diffArtifact()],
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toContain('## Diffs');
    expect(body).toContain('`l` → `r`');
  });
});

describe('NekoJSON: workspace round-trip with diff artifact', () => {
  it('a diff artifact survives serialize -> deserialize losslessly', () => {
    const r = registry();
    const parsed = runParser(r, 'json', 'json.diff.textual', {
      raw: '',
      source: { kind: 'derived', from: ['l', 'r'] },
      hints: {
        leftArtifactId: 'l',
        leftDocument: { a: 1 },
        rightArtifactId: 'r',
        rightDocument: { a: 2 },
      },
    });
    const ws: Workspace = {
      version: 1,
      id: 'ws_diff',
      toolId: 'json',
      toolVersion: 1,
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
    };
    const raw = jsonWorkspaceSerializer.serialize(ws);
    const back = jsonWorkspaceSerializer.deserialize(raw);
    expect(back).toEqual(ws);
  });
});
