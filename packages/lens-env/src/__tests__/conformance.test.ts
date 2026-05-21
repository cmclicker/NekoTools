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
  buildEnvRegistration,
  canonicalize,
  computeTextualDiff,
  detectShape,
  diffLines,
  envManifest,
  inferBasicSchema,
  renderExample,
} from '../index.js';
import type {
  EnvDiff,
  EnvDiffArtifact,
  EnvDocument,
  EnvDocumentArtifact,
  EnvKeyResult,
} from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-20T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildEnvRegistration(clock));
  return r;
}

describe('NekoEnv: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(envManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy', () => {
    expect(envManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('declares Pro features (advertising) even though free build only ships free ones', () => {
    expect(envManifest.entitlements.pro.length).toBeGreaterThan(0);
    expect(envManifest.entitlements.free).toContain('parse');
  });

  it('declares an explicit out-of-scope list covering secret stores + interpolation', () => {
    expect(envManifest.outOfScope.length).toBeGreaterThan(0);
    expect(envManifest.outOfScope.some((s) => s.includes('secret'))).toBe(true);
    expect(envManifest.outOfScope.some((s) => s.includes('interpolation'))).toBe(true);
  });

  it('capabilities reflect current-build truth, not lifetime intent', () => {
    expect(envManifest.capabilities.canSaveWorkspace).toBe(true);
    expect(envManifest.capabilities.canExport).toBe(true);
    expect(envManifest.capabilities.canDiff).toBe(true);
    expect(envManifest.capabilities.canProjectGraph).toBe(false);
  });
});

/**
 * Monetization safety: the free build must not bundle Pro
 * implementations, and the manifest's free entitlements must not
 * advertise features the build cannot actually perform.
 *
 * Mirrors NekoJSON's monetization-safety block — these are the
 * mechanical enforcement of the open-core governance rule.
 */
describe('NekoEnv: monetization safety', () => {
  const registration = buildEnvRegistration(clock);

  const proExporterIds = [
    'env.export.types.typescript',
    'env.export.types.zod',
    'env.export.docs.data-dictionary',
    'env.export.compose.dotenv-stack',
  ];

  const proProjectorIds = ['env.graph.references'];

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
        runExporter(r, 'env', id, { artifacts: [], diagnostics: [] }),
      ).toThrow(/unknown exporter/);
    }
  });

  it('the manifest declares Pro exporters that are NOT in the registered set', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) {
      expect(envManifest.exporters).toContain(id);
      expect(registered.has(id)).toBe(false);
    }
  });

  it('the manifest free entitlements list matches what the Phase 2.1 engine actually ships', () => {
    // UI entitlements (view.table, view.text, view.diff, search,
    // copy.key, copy.value, mask.value) are deliberately ABSENT — they
    // land in Phase 2.2. Adding them here without an implementation
    // would be misleading advertising.
    const expectedFree = new Set([
      'parse',
      'format',
      'validate',
      'inspect.key',
      'schema.infer.basic',
      'diff.textual',
      'export.env.canonical',
      'export.env.example',
      'export.markdown.summary',
      'export.plaintext.keys',
      'export.schema.basic',
      'export.diff.textual',
      'workspace.save',
    ]);
    const declared = new Set(envManifest.entitlements.free);
    expect(declared).toEqual(expectedFree);
  });

  it('declared but unimplemented free features list is empty for Phase 2.1 engine scope', () => {
    // Every id in `entitlements.free` must have a working implementation
    // in this build. The engine-MVP set is fully shipped. Phase 2.2 UI
    // entitlements are NOT in `entitlements.free` yet (see test above).
    const declared = new Set(envManifest.entitlements.free);
    const knownImplemented = new Set([
      'parse',
      'format',
      'validate',
      'inspect.key',
      'schema.infer.basic',
      'diff.textual',
      'export.env.canonical',
      'export.env.example',
      'export.markdown.summary',
      'export.plaintext.keys',
      'export.schema.basic',
      'export.diff.textual',
      'workspace.save',
    ]);
    for (const id of declared) {
      expect(knownImplemented.has(id), `declared free entitlement "${id}" is not implemented`).toBe(
        true,
      );
    }
  });
});

describe('NekoEnv: env.text parser', () => {
  function parse(raw: string) {
    const r = registry();
    return runParser(r, 'env', 'env.text', {
      raw,
      source: { kind: 'paste', bytes: raw.length },
    });
  }

  it('parses simple KEY=VALUE pairs', () => {
    const result = parse('A=1\nB=two\n');
    expect(result.artifacts).toHaveLength(1);
    const doc = (result.artifacts[0] as EnvDocumentArtifact).value;
    expect(doc.entries.map((e) => [e.key, e.value])).toEqual([
      ['A', '1'],
      ['B', 'two'],
    ]);
  });

  it('preserves blank lines and comments in `lines` while keeping `entries` flat', () => {
    const result = parse('# header\n\nA=1\n# inline doc for B\nB=two\n');
    const doc = (result.artifacts[0] as EnvDocumentArtifact).value;
    expect(doc.entries.map((e) => e.key)).toEqual(['A', 'B']);
    const kinds = doc.lines.map((l) => l.kind);
    expect(kinds).toContain('blank');
    expect(kinds).toContain('comment');
    expect(kinds.filter((k) => k === 'entry')).toHaveLength(2);
  });

  it('emits env.empty_input at info severity for whitespace-only input AND still produces a document', () => {
    const result = parse('   \n   \n');
    expect(result.artifacts).toHaveLength(1);
    const doc = (result.artifacts[0] as EnvDocumentArtifact).value;
    expect(doc.entries).toEqual([]);
    const diag = result.diagnostics.find((d) => d.code === 'env.empty_input');
    expect(diag?.severity).toBe('info');
  });

  it('emits env.empty_input at info severity for comments-only input AND still produces a document', () => {
    // Charter §3 authoritative policy: a comments-only dotenv document
    // is syntactically valid and produces an env.document artifact
    // with preserved comments + zero entries. info, never error.
    const result = parse('# this is a header\n# meant as documentation\n');
    expect(result.artifacts).toHaveLength(1);
    const doc = (result.artifacts[0] as EnvDocumentArtifact).value;
    expect(doc.entries).toEqual([]);
    expect(doc.lines.every((l) => l.kind === 'comment')).toBe(true);
    const diag = result.diagnostics.find((d) => d.code === 'env.empty_input');
    expect(diag?.severity).toBe('info');
  });

  it('does not emit env.empty_input when the document has entries', () => {
    const result = parse('A=1\n');
    expect(result.diagnostics.find((d) => d.code === 'env.empty_input')).toBeUndefined();
  });

  it('emits env.syntax_error for a malformed line (no `=` sign)', () => {
    const result = parse('garbage line\nA=1\n');
    const diag = result.diagnostics.find((d) => d.code === 'env.syntax_error');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('error');
    // The entry-shaped line still parses.
    const doc = (result.artifacts[0] as EnvDocumentArtifact).value;
    expect(doc.entries.find((e) => e.key === 'A')?.value).toBe('1');
  });

  it('emits env.invalid_key for a key that does not match [A-Za-z_][A-Za-z0-9_]*', () => {
    const result = parse('1FOO=bar\n');
    const diag = result.diagnostics.find((d) => d.code === 'env.invalid_key');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('error');
    // But the entry is still produced — the user can see + fix it.
    const doc = (result.artifacts[0] as EnvDocumentArtifact).value;
    expect(doc.entries[0]?.key).toBe('1FOO');
  });

  it('emits env.duplicate_key (warning) on a repeated key with the first-occurrence line in the message', () => {
    const result = parse('A=1\nA=2\n');
    const diag = result.diagnostics.find((d) => d.code === 'env.duplicate_key');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('warning');
    expect(diag?.message).toContain('line 1');
  });

  it('emits env.shell_export_prefix (warning) for lines beginning with `export `', () => {
    const result = parse('export A=1\n');
    const diag = result.diagnostics.find((d) => d.code === 'env.shell_export_prefix');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('warning');
    const doc = (result.artifacts[0] as EnvDocumentArtifact).value;
    expect(doc.entries[0]?.exportPrefix).toBe(true);
    expect(doc.entries[0]?.value).toBe('1');
  });

  it('emits env.interpolation_token (info) when a value contains $VAR / ${VAR} / $(cmd)', () => {
    const result = parse('A=$HOST\nB=${HOST}\nC=$(echo hi)\nD=literal\n');
    const interps = result.diagnostics.filter((d) => d.code === 'env.interpolation_token');
    expect(interps).toHaveLength(3);
    expect(interps.every((d) => d.severity === 'info')).toBe(true);
  });

  it('decodes \\n \\r \\t \\" \\\\ escapes inside double-quoted values', () => {
    const result = parse('MSG="hi\\nthere\\t\\"quoted\\""\n');
    const doc = (result.artifacts[0] as EnvDocumentArtifact).value;
    expect(doc.entries[0]?.value).toBe('hi\nthere\t"quoted"');
    expect(doc.entries[0]?.quoting).toBe('double');
  });

  it('does NOT process escapes inside single-quoted values (literal body)', () => {
    const result = parse("MSG='hi\\nthere'\n");
    const doc = (result.artifacts[0] as EnvDocumentArtifact).value;
    expect(doc.entries[0]?.value).toBe('hi\\nthere');
    expect(doc.entries[0]?.quoting).toBe('single');
  });

  it('handles multi-line double-quoted values across source lines', () => {
    const result = parse('CERT="line1\nline2\nline3"\nNEXT=ok\n');
    const doc = (result.artifacts[0] as EnvDocumentArtifact).value;
    expect(doc.entries.map((e) => e.key)).toEqual(['CERT', 'NEXT']);
    expect(doc.entries[0]?.value).toBe('line1\nline2\nline3');
    expect(doc.entries[0]?.startLine).toBe(1);
    expect(doc.entries[0]?.endLine).toBe(3);
    expect(doc.entries[1]?.startLine).toBe(4);
  });

  it('emits env.unterminated_quote (error) when a quoted value never closes', () => {
    const result = parse('A="open and never closed\nB=should also fail\n');
    const diag = result.diagnostics.find((d) => d.code === 'env.unterminated_quote');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('error');
  });

  it('splits trailing `# comment` off of unquoted values when preceded by whitespace', () => {
    const result = parse('A=foo # this is a comment\n');
    const doc = (result.artifacts[0] as EnvDocumentArtifact).value;
    expect(doc.entries[0]?.value).toBe('foo');
    expect(doc.entries[0]?.trailingComment).toBe('this is a comment');
  });

  it('does NOT split `#` when it is part of the value (no preceding whitespace)', () => {
    const result = parse('A=foo#bar\n');
    const doc = (result.artifacts[0] as EnvDocumentArtifact).value;
    expect(doc.entries[0]?.value).toBe('foo#bar');
    expect(doc.entries[0]?.trailingComment).toBeUndefined();
  });

  it('trims leading + trailing horizontal whitespace from unquoted values', () => {
    const result = parse('A=   hello   \n');
    const doc = (result.artifacts[0] as EnvDocumentArtifact).value;
    expect(doc.entries[0]?.value).toBe('hello');
  });

  it('produces an artifact that validates against the artifact schema', () => {
    const result = parse('A=1\n');
    const validation = validate('artifact', result.artifacts[0]);
    expect(validation.ok, validation.errors.join('; ')).toBe(true);
  });
});

describe('NekoEnv: env.text large-document soft threshold', () => {
  function smallRegistry(threshold: number): ToolRegistry {
    const r = new ToolRegistry();
    r.register(buildEnvRegistration(clock, { largeDocumentBytes: threshold }));
    return r;
  }

  it('does not emit env.large_document for inputs under the threshold', () => {
    const r = smallRegistry(100);
    const result = runParser(r, 'env', 'env.text', {
      raw: 'A=1\n',
      source: { kind: 'paste', bytes: 4 },
    });
    expect(result.diagnostics.find((d) => d.code === 'env.large_document')).toBeUndefined();
  });

  it('emits env.large_document (info) for inputs over the threshold', () => {
    const r = smallRegistry(10);
    const result = runParser(r, 'env', 'env.text', {
      raw: 'A=hello world here is some content\n',
      source: { kind: 'paste', bytes: 36 },
    });
    const diag = result.diagnostics.find((d) => d.code === 'env.large_document');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('info');
  });

  it('uses UTF-8 byte length, not JS UTF-16 string length, for the threshold check', () => {
    // `A=é\n` is 4 source chars (UTF-16 code units) but 5 UTF-8 bytes
    // (the `é` itself takes 2 bytes). With threshold = 4, JS-length 4
    // would not trip, but UTF-8-length 5 must.
    const r = smallRegistry(4);
    const result = runParser(r, 'env', 'env.text', {
      raw: 'A=é\n',
      source: { kind: 'paste', bytes: 5 },
    });
    const diag = result.diagnostics.find((d) => d.code === 'env.large_document');
    expect(diag).toBeDefined();
    expect(diag?.message).toContain('5 bytes');
  });
});

describe('NekoEnv: env.key parser', () => {
  function parseEnv(raw: string): EnvDocumentArtifact {
    const r = registry();
    const result = runParser(r, 'env', 'env.text', {
      raw,
      source: { kind: 'paste', bytes: raw.length },
    });
    return result.artifacts[0] as EnvDocumentArtifact;
  }

  it('returns present:true with the entry when the key exists', () => {
    const doc = parseEnv('A=1\nB=two\n');
    const r = registry();
    const result = runParser(r, 'env', 'env.key', {
      raw: 'A',
      source: { kind: 'paste', bytes: 1 },
      hints: { document: doc.value, documentArtifactId: doc.id },
    });
    expect(result.diagnostics).toHaveLength(0);
    const value = result.artifacts[0]!.value as EnvKeyResult;
    expect(value.present).toBe(true);
    if (value.present) expect(value.entry.value).toBe('1');
  });

  it('returns present:false + env.key.not_found when the key is absent', () => {
    const doc = parseEnv('A=1\n');
    const r = registry();
    const result = runParser(r, 'env', 'env.key', {
      raw: 'NOPE',
      source: { kind: 'paste', bytes: 4 },
      hints: { document: doc.value, documentArtifactId: doc.id },
    });
    const value = result.artifacts[0]!.value as EnvKeyResult;
    expect(value.present).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('env.key.not_found');
  });

  it('with duplicate keys, the LAST occurrence wins (dotenv loader semantics)', () => {
    const doc = parseEnv('A=first\nA=second\nA=third\n');
    const r = registry();
    const result = runParser(r, 'env', 'env.key', {
      raw: 'A',
      source: { kind: 'paste', bytes: 1 },
      hints: { document: doc.value, documentArtifactId: doc.id },
    });
    const value = result.artifacts[0]!.value as EnvKeyResult;
    expect(value.present).toBe(true);
    if (value.present) expect(value.entry.value).toBe('third');
  });

  it('returns env.key.not_found when no document hint is provided', () => {
    const r = registry();
    const result = runParser(r, 'env', 'env.key', {
      raw: 'A',
      source: { kind: 'paste', bytes: 1 },
    });
    expect(result.diagnostics[0]?.code).toBe('env.key.not_found');
  });
});

describe('NekoEnv: schema inference (basic)', () => {
  function inferFrom(raw: string) {
    const r = registry();
    const result = runParser(r, 'env', 'env.text', {
      raw,
      source: { kind: 'paste', bytes: raw.length },
    });
    return inferBasicSchema((result.artifacts[0] as EnvDocumentArtifact).value);
  }

  it('detects boolean / integer / decimal / url / empty / string shapes', () => {
    expect(detectShape('')).toBe('empty');
    expect(detectShape('true')).toBe('boolean');
    expect(detectShape('FALSE')).toBe('boolean');
    expect(detectShape('42')).toBe('integer');
    expect(detectShape('-3')).toBe('integer');
    expect(detectShape('3.14')).toBe('decimal');
    expect(detectShape('1.5e10')).toBe('decimal');
    expect(detectShape('https://example.com')).toBe('url');
    expect(detectShape('hello')).toBe('string');
  });

  it('marks url shapes with format:uri', () => {
    const schema = inferFrom('SITE=https://example.com\n');
    expect(schema.properties['SITE']?.shape).toBe('url');
    expect(schema.properties['SITE']?.format).toBe('uri');
  });

  it('lists every key as required and additionalProperties=true', () => {
    const schema = inferFrom('A=1\nB=2\n');
    expect(schema.required).toEqual(['A', 'B']);
    expect(schema.additionalProperties).toBe(true);
  });

  it('collapses duplicate keys (last-occurrence-wins) before inferring', () => {
    const schema = inferFrom('A=true\nA=42\n');
    // Last occurrence ("42") wins → integer, not boolean.
    expect(schema.properties['A']?.shape).toBe('integer');
    expect(schema.required).toEqual(['A']);
  });
});

describe('NekoEnv: canonical re-emit', () => {
  function parseDoc(raw: string): EnvDocument {
    const r = registry();
    const result = runParser(r, 'env', 'env.text', {
      raw,
      source: { kind: 'paste', bytes: raw.length },
    });
    return (result.artifacts[0] as EnvDocumentArtifact).value;
  }

  it("'preserved' mode round-trips comments + blank lines + entries", () => {
    const src = '# header\n\nA=1\nB=two\n';
    const out = canonicalize(parseDoc(src), 'preserved');
    expect(out).toContain('# header');
    expect(out).toContain('A=1');
    expect(out).toContain('B=two');
  });

  it("'sorted' mode sorts by key + double-quotes values that need it, dropping comments", () => {
    const out = canonicalize(parseDoc('B=two\nA=1\n'), 'sorted');
    expect(out).toBe('A=1\nB=two');
  });

  it("'sorted' mode uses last-occurrence-wins for duplicate keys", () => {
    const out = canonicalize(parseDoc('A=first\nA=second\n'), 'sorted');
    expect(out).toBe('A=second');
  });

  it('quotes values that contain whitespace, #, $, or quotes', () => {
    const out = canonicalize(parseDoc('A="hello world"\nB="has#hash"\nC=plain\n'), 'sorted');
    expect(out).toContain('A="hello world"');
    expect(out).toContain('B="has#hash"');
    expect(out).toContain('C=plain');
  });

  it('renderExample strips values but preserves keys + comments', () => {
    const src = '# DB connection\nDB_URL=postgres://x\nDB_PASS=secret\n';
    const out = renderExample(parseDoc(src));
    expect(out).toContain('# DB connection');
    expect(out).toContain('DB_URL=');
    expect(out).toContain('DB_PASS=');
    expect(out).not.toContain('postgres://x');
    expect(out).not.toContain('secret');
  });
});

describe('NekoEnv: env.diff.textual parser', () => {
  function parseDoc(raw: string): EnvDocumentArtifact {
    const r = registry();
    const result = runParser(r, 'env', 'env.text', {
      raw,
      source: { kind: 'paste', bytes: raw.length },
    });
    return result.artifacts[0] as EnvDocumentArtifact;
  }

  function diffArtifact(leftRaw: string, rightRaw: string): EnvDiffArtifact {
    const left = parseDoc(leftRaw);
    const right = parseDoc(rightRaw);
    const r = registry();
    const result = runParser(r, 'env', 'env.diff.textual', {
      raw: '',
      source: { kind: 'derived', from: [left.id, right.id] },
      hints: {
        leftArtifactId: left.id,
        leftDocument: left.value,
        rightArtifactId: right.id,
        rightDocument: right.value,
      },
    });
    expect(result.diagnostics).toHaveLength(0);
    return result.artifacts[0] as EnvDiffArtifact;
  }

  it('produces a json-shaped env.diff artifact', () => {
    const art = diffArtifact('A=1\n', 'A=1\n');
    expect(art.kind).toBe('env.diff');
    expect(art.source.kind).toBe('derived');
    const v = art.value as EnvDiff;
    expect(v.hunks.every((h) => h.kind === 'equal')).toBe(true);
  });

  it('reorders identical docs without producing diff noise (canonical sort)', () => {
    const art = diffArtifact('B=2\nA=1\n', 'A=1\nB=2\n');
    expect(art.value.hunks.every((h) => h.kind === 'equal')).toBe(true);
  });

  it('emits add/remove hunks when values differ', () => {
    const art = diffArtifact('A=1\n', 'A=2\n');
    expect(art.value.hunks.some((h) => h.kind === 'add')).toBe(true);
    expect(art.value.hunks.some((h) => h.kind === 'remove')).toBe(true);
  });

  it('emits env.diff.missing_input when ids are absent', () => {
    const r = registry();
    const result = runParser(r, 'env', 'env.diff.textual', {
      raw: '',
      source: { kind: 'derived', from: [] },
      hints: { leftDocument: { entries: [], lines: [] }, rightDocument: { entries: [], lines: [] } },
    });
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe('env.diff.missing_input');
  });

  it('emits env.diff.missing_input when a document hint key is absent (does not throw)', () => {
    const r = registry();
    const call = () =>
      runParser(r, 'env', 'env.diff.textual', {
        raw: '',
        source: { kind: 'derived', from: ['l', 'r'] },
        hints: { leftArtifactId: 'l', rightArtifactId: 'r', rightDocument: { entries: [], lines: [] } },
      });
    expect(call).not.toThrow();
    const result = call();
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe('env.diff.missing_input');
  });

  it('emits env.diff.missing_input when a document hint is the wrong shape', () => {
    const r = registry();
    const result = runParser(r, 'env', 'env.diff.textual', {
      raw: '',
      source: { kind: 'derived', from: ['l', 'r'] },
      hints: {
        leftArtifactId: 'l',
        rightArtifactId: 'r',
        leftDocument: 'not an env document',
        rightDocument: { entries: [], lines: [] },
      },
    });
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe('env.diff.missing_input');
  });

  it('diffLines helper distinguishes add / remove / equal', () => {
    const hunks = diffLines(['a', 'b', 'c'], ['a', 'B', 'c']);
    const kinds = hunks.map((h) => h.kind);
    expect(kinds).toContain('equal');
    expect(kinds).toContain('add');
    expect(kinds).toContain('remove');
  });

  it('computeTextualDiff is callable directly with two EnvDocuments', () => {
    const left = parseDoc('A=1\n').value;
    const right = parseDoc('A=2\n').value;
    const diff = computeTextualDiff('l', 'r', left, right);
    expect(diff.hunks.some((h) => h.kind === 'add')).toBe(true);
    expect(diff.hunks.some((h) => h.kind === 'remove')).toBe(true);
  });

  it('produced artifact validates against the artifact schema', () => {
    const art = diffArtifact('A=1\n', 'A=2\n');
    const result = validate('artifact', art);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });
});

describe('NekoEnv: exporters', () => {
  function parsedDocs(raw: string): readonly EnvDocumentArtifact[] {
    const r = registry();
    const result = runParser(r, 'env', 'env.text', {
      raw,
      source: { kind: 'paste', bytes: raw.length },
    });
    return result.artifacts as readonly EnvDocumentArtifact[];
  }

  it('env.canonical re-emits the document', () => {
    const r = registry();
    const out = runExporter(r, 'env', 'env.export.env.canonical', {
      artifacts: parsedDocs('A=1\n# comment\nB="two"\n'),
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toContain('A=1');
    expect(body).toContain('# comment');
    expect(body).toContain('B=two');
  });

  it('env.example produces a values-stripped skeleton', () => {
    const r = registry();
    const out = runExporter(r, 'env', 'env.export.env.example', {
      artifacts: parsedDocs('# header\nDB_URL=postgres://x\n'),
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toContain('# header');
    expect(body).toContain('DB_URL=');
    expect(body).not.toContain('postgres://x');
  });

  it('markdown.summary mentions document shape and diagnostics', () => {
    const r = registry();
    const out = runExporter(r, 'env', 'env.export.markdown.summary', {
      artifacts: parsedDocs('A=1\nB=2\n'),
      diagnostics: [
        {
          version: 1,
          id: 'd1',
          severity: 'warning',
          code: 'env.test',
          message: 'sample diagnostic',
        },
      ],
    });
    const body = String(out.body);
    expect(body).toContain('2 entries');
    expect(body).toContain('sample diagnostic');
  });

  it('plaintext.keys emits sorted deduplicated keys', () => {
    const r = registry();
    const out = runExporter(r, 'env', 'env.export.plaintext.keys', {
      artifacts: parsedDocs('B=2\nA=1\nB=2-again\n'),
      diagnostics: [],
    });
    expect(String(out.body)).toBe('A\nB');
  });

  it('schema.json-schema emits a valid-shape inferred schema with type:object', () => {
    const r = registry();
    const out = runExporter(r, 'env', 'env.export.schema.json-schema', {
      artifacts: parsedDocs('PORT=8080\nDEBUG=true\n'),
      diagnostics: [],
    });
    const parsed = JSON.parse(String(out.body)) as {
      type?: string;
      properties?: Record<string, { type?: string; shape?: string }>;
    };
    expect(parsed.type).toBe('object');
    expect(parsed.properties?.['PORT']?.shape).toBe('integer');
    expect(parsed.properties?.['DEBUG']?.shape).toBe('boolean');
  });

  it('diff.textual renders unified-diff plaintext', () => {
    const r = registry();
    const left = parsedDocs('A=1\n')[0]!;
    const right = parsedDocs('A=2\n')[0]!;
    const diff = runParser(r, 'env', 'env.diff.textual', {
      raw: '',
      source: { kind: 'derived', from: [left.id, right.id] },
      hints: {
        leftArtifactId: left.id,
        leftDocument: left.value,
        rightArtifactId: right.id,
        rightDocument: right.value,
      },
    });
    const out = runExporter(r, 'env', 'env.export.diff.textual', {
      artifacts: diff.artifacts,
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toMatch(/^- A=1/m);
    expect(body).toMatch(/^\+ A=2/m);
    expect(out.extension).toBe('diff');
  });

  it('document-only exporters refuse env.diff artifacts (runtime enforces accepts)', () => {
    const r = registry();
    const left = parsedDocs('A=1\n')[0]!;
    const right = parsedDocs('A=2\n')[0]!;
    const diff = runParser(r, 'env', 'env.diff.textual', {
      raw: '',
      source: { kind: 'derived', from: [left.id, right.id] },
      hints: {
        leftArtifactId: left.id,
        leftDocument: left.value,
        rightArtifactId: right.id,
        rightDocument: right.value,
      },
    });
    for (const id of [
      'env.export.env.canonical',
      'env.export.env.example',
      'env.export.plaintext.keys',
      'env.export.schema.json-schema',
    ]) {
      expect(() =>
        runExporter(r, 'env', id, { artifacts: diff.artifacts, diagnostics: [] }),
      ).toThrow(/does not accept artifact kind/);
    }
  });

  it('diff exporter refuses env.document artifacts (runtime enforces accepts)', () => {
    const r = registry();
    expect(() =>
      runExporter(r, 'env', 'env.export.diff.textual', {
        artifacts: parsedDocs('A=1\n'),
        diagnostics: [],
      }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoEnv: workspace round-trip', () => {
  it('a single-document workspace round-trips losslessly', () => {
    const r = registry();
    const parsed = runParser(r, 'env', 'env.text', {
      raw: 'A=1\n# doc\nB="two"\n',
      source: { kind: 'paste', bytes: 18 },
    });
    const ws: Workspace = {
      version: 1,
      id: 'ws_env_demo',
      toolId: 'env',
      toolVersion: 1,
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { activeKey: 'A', viewMode: 'table' },
    };
    const back = jsonWorkspaceSerializer.deserialize(
      jsonWorkspaceSerializer.serialize(ws),
    );
    expect(back).toEqual(ws);
  });

  it('a multi-document workspace with a diff artifact round-trips losslessly', () => {
    const r = registry();
    const left = runParser(r, 'env', 'env.text', {
      raw: 'A=1\n',
      source: { kind: 'paste', bytes: 4 },
    });
    const right = runParser(r, 'env', 'env.text', {
      raw: 'A=2\n',
      source: { kind: 'paste', bytes: 4 },
    });
    const leftDoc = left.artifacts[0] as EnvDocumentArtifact;
    const rightDoc = right.artifacts[0] as EnvDocumentArtifact;
    const diff = runParser(r, 'env', 'env.diff.textual', {
      raw: '',
      source: { kind: 'derived', from: [leftDoc.id, rightDoc.id] },
      hints: {
        leftArtifactId: leftDoc.id,
        leftDocument: leftDoc.value,
        rightArtifactId: rightDoc.id,
        rightDocument: rightDoc.value,
      },
    });
    const ws: Workspace = {
      version: 1,
      id: 'ws_env_multi',
      toolId: 'env',
      toolVersion: 1,
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
      artifacts: [leftDoc, rightDoc, ...diff.artifacts],
      diagnostics: [...left.diagnostics, ...right.diagnostics, ...diff.diagnostics],
    };
    const back = jsonWorkspaceSerializer.deserialize(
      jsonWorkspaceSerializer.serialize(ws),
    );
    expect(back).toEqual(ws);
  });
});
