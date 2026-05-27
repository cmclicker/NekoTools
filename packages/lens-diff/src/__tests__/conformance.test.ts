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

import { buildDiffRegistration, DIFF_KIND_RESULT, FIXED_CLOCK, diffManifest } from '../index.js';
import type { DiffResult, DiffResultArtifact } from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-27T00:00:00.000Z');

function registry(opts?: { largeInputBytes?: number }): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildDiffRegistration(clock, opts));
  return r;
}

function runDiff(
  parserId: string,
  leftText: string,
  rightText: string,
  opts?: { largeInputBytes?: number },
) {
  return runParser(registry(opts), 'diff', parserId, {
    raw: '',
    source: { kind: 'derived', from: ['left', 'right'] },
    hints: { leftText, rightText },
  });
}

function resultOf(parserId: string, leftText: string, rightText: string): DiffResult {
  const r = runDiff(parserId, leftText, rightText);
  return (r.artifacts[0] as DiffResultArtifact).value;
}

function artifactOf(parserId: string, leftText: string, rightText: string): DiffResultArtifact {
  return runDiff(parserId, leftText, rightText).artifacts[0] as DiffResultArtifact;
}

describe('NekoDiff: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(diffManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy', () => {
    expect(diffManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('declares Pro features even though the free build ships only free ones', () => {
    expect(diffManifest.entitlements.pro.length).toBeGreaterThan(0);
    expect(diffManifest.entitlements.free).toContain('diff.text');
  });

  it('capabilities reflect current-build truth (diff yes, graph no)', () => {
    expect(diffManifest.capabilities.canDiff).toBe(true);
    expect(diffManifest.capabilities.canExport).toBe(true);
    expect(diffManifest.capabilities.canSaveWorkspace).toBe(true);
    expect(diffManifest.capabilities.canProjectGraph).toBe(false);
  });

  it('declares an out-of-scope list covering merge resolution + remote fetch', () => {
    expect(diffManifest.outOfScope.some((s) => /merge/i.test(s))).toBe(true);
    expect(diffManifest.outOfScope.some((s) => /url|git ref|file path/i.test(s))).toBe(true);
  });
});

describe('NekoDiff: monetization safety', () => {
  const registration = buildDiffRegistration(clock);
  const proExporterIds = ['diff.export.semantic', 'diff.export.bundle.signed'];

  it('no Pro exporter is registered in the free build', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) expect(registered.has(id)).toBe(false);
  });

  it('no graph projector is registered in the free build', () => {
    expect(registration.graphProjectors ?? []).toHaveLength(0);
  });

  it('runExporter throws "unknown exporter" for every Pro exporter id', () => {
    const r = registry();
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'diff', id, { artifacts: [], diagnostics: [] })).toThrow(
        /unknown exporter/,
      );
    }
  });

  it('the manifest declares Pro exporters that are NOT in the registered set', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) {
      expect(diffManifest.exporters).toContain(id);
      expect(registered.has(id)).toBe(false);
    }
  });

  it('free entitlements match exactly the implemented vertical-slice set', () => {
    const expectedFree = new Set([
      'diff.text',
      'diff.json',
      'diff.yaml',
      'summary.counts',
      'view.unified',
      'export.unified',
      'export.json',
      'export.markdown',
      'copy.output',
      'workspace.save',
    ]);
    expect(new Set(diffManifest.entitlements.free)).toEqual(expectedFree);
  });

  it('no feature is declared both free and pro', () => {
    const free = new Set(diffManifest.entitlements.free);
    for (const p of diffManifest.entitlements.pro) expect(free.has(p)).toBe(false);
  });
});

describe('NekoDiff: diff.text parser', () => {
  it('classifies added / removed / unchanged lines with a changed-count summary', () => {
    const result = resultOf('diff.text', 'a\nb\nc', 'a\nx\nc');
    expect(result.mode).toBe('text');
    expect(result.comparable).toBe(true);
    expect(result.summary.added).toBe(1);
    expect(result.summary.removed).toBe(1);
    expect(result.summary.unchanged).toBe(2);
    expect(result.summary.changed).toBe(2);
    expect(result.summary.identical).toBe(false);
    expect(result.hunks.some((h) => h.kind === 'add' && h.text === 'x')).toBe(true);
    expect(result.hunks.some((h) => h.kind === 'remove' && h.text === 'b')).toBe(true);
  });

  it('flags two identical inputs with a diff.identical info diagnostic', () => {
    const r = runDiff('diff.text', 'a\nb', 'a\nb');
    const result = (r.artifacts[0] as DiffResultArtifact).value;
    expect(result.summary.identical).toBe(true);
    expect(result.summary.added).toBe(0);
    expect(result.summary.removed).toBe(0);
    expect(r.diagnostics.find((d) => d.code === 'diff.identical')?.severity).toBe('info');
  });

  it('treats an empty side as all-removed and emits diff.empty_input (info)', () => {
    const r = runDiff('diff.text', 'a\nb', '');
    const result = (r.artifacts[0] as DiffResultArtifact).value;
    expect(result.summary.removed).toBe(2);
    expect(result.summary.added).toBe(0);
    expect(r.diagnostics.find((d) => d.code === 'diff.empty_input')?.severity).toBe('info');
  });

  it('emits diff.missing_input (error, no artifact) when hints are absent', () => {
    const r = runParser(registry(), 'diff', 'diff.text', {
      raw: '',
      source: { kind: 'paste', bytes: 0 },
    });
    expect(r.artifacts).toHaveLength(0);
    expect(r.diagnostics[0]?.code).toBe('diff.missing_input');
    expect(r.diagnostics[0]?.severity).toBe('error');
  });

  it('emits diff.large_input (info) above the soft per-side threshold', () => {
    const r = runDiff('diff.text', 'hello world', 'x', { largeInputBytes: 4 });
    expect(r.diagnostics.find((d) => d.code === 'diff.large_input')?.severity).toBe('info');
  });

  it('emits diff.binary_input (warning) for a NUL byte in a side', () => {
    const withNul = `a${String.fromCharCode(0)}b`;
    const r = runDiff('diff.text', withNul, 'b');
    expect(r.diagnostics.find((d) => d.code === 'diff.binary_input')?.severity).toBe('warning');
  });

  it('never throws and produces a diff.result artifact', () => {
    const call = () => runDiff('diff.text', 'x', 'y');
    expect(call).not.toThrow();
    expect(call().artifacts[0]?.kind).toBe(DIFF_KIND_RESULT);
  });
});

describe('NekoDiff: diff.json parser', () => {
  it('compares in canonical form so reordered keys are NOT a difference', () => {
    const result = resultOf('diff.json', '{"b":2,"a":1}', '{"a":1,"b":2}');
    expect(result.comparable).toBe(true);
    expect(result.summary.identical).toBe(true);
  });

  it('reports a real value change with add/remove hunks', () => {
    const result = resultOf('diff.json', '{"a":1}', '{"a":2}');
    expect(result.summary.identical).toBe(false);
    expect(result.summary.added).toBe(1);
    expect(result.summary.removed).toBe(1);
  });

  it('emits diff.parse_error and marks the result not comparable on invalid JSON', () => {
    const r = runDiff('diff.json', '{"a":1}', 'not json');
    const result = (r.artifacts[0] as DiffResultArtifact).value;
    expect(result.comparable).toBe(false);
    expect(result.hunks).toHaveLength(0);
    const diag = r.diagnostics.find((d) => d.code === 'diff.parse_error');
    expect(diag?.severity).toBe('error');
    expect(diag?.message).toMatch(/Right side/);
  });
});

describe('NekoDiff: diff.yaml parser (reuses @nekotools/lens-yaml)', () => {
  it('normalizes flow vs block YAML so syntax-only differences vanish', () => {
    const result = resultOf('diff.yaml', '{a: 1, b: 2}\n', 'a: 1\nb: 2\n');
    expect(result.comparable).toBe(true);
    expect(result.summary.identical).toBe(true);
  });

  it('reports a real value change between two YAML documents', () => {
    const result = resultOf('diff.yaml', 'a: 1\n', 'a: 2\n');
    expect(result.summary.identical).toBe(false);
    expect(result.summary.changed).toBeGreaterThan(0);
  });

  it('emits diff.parse_error and marks the result not comparable on invalid YAML', () => {
    const r = runDiff('diff.yaml', 'a: 1\n', 'a: [1, 2\n');
    const result = (r.artifacts[0] as DiffResultArtifact).value;
    expect(result.comparable).toBe(false);
    expect(r.diagnostics.find((d) => d.code === 'diff.parse_error')?.severity).toBe('error');
  });
});

describe('NekoDiff: artifact + workspace', () => {
  it('produces a diff.result artifact that validates against the artifact schema', () => {
    const artifact = artifactOf('diff.text', 'a\n', 'b\n');
    const validation = validate('artifact', artifact);
    expect(validation.ok, validation.errors.join('; ')).toBe(true);
  });

  it('a diff workspace round-trips losslessly', () => {
    const parsed = runDiff('diff.text', 'a\nb\nc', 'a\nx\nc');
    const ws: Workspace = {
      version: 1,
      id: 'ws_diff',
      toolId: 'diff',
      toolVersion: 1,
      createdAt: '2026-05-27T00:00:00.000Z',
      updatedAt: '2026-05-27T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { mode: 'text' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});

describe('NekoDiff: exporters', () => {
  it('diff.export.unified renders --- / +++ headers and +/- markers', () => {
    const artifact = artifactOf('diff.text', 'a\nb\nc', 'a\nx\nc');
    const out = runExporter(registry(), 'diff', 'diff.export.unified', {
      artifacts: [artifact],
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toContain('--- Left');
    expect(body).toContain('+++ Right');
    expect(body).toContain('+ x');
    expect(body).toContain('- b');
    expect(out.extension).toBe('diff');
  });

  it('diff.export.json emits the structured diff result', () => {
    const artifact = artifactOf('diff.text', 'a\n', 'b\n');
    const out = runExporter(registry(), 'diff', 'diff.export.json', {
      artifacts: [artifact],
      diagnostics: [],
    });
    const parsed = JSON.parse(String(out.body)) as DiffResult;
    expect(parsed.mode).toBe('text');
    expect(parsed.summary.changed).toBe(2);
  });

  it('diff.export.markdown.summary describes counts + diagnostics', () => {
    const parsed = runDiff('diff.text', 'a\nb\nc', 'a\nx\nc');
    const out = runExporter(registry(), 'diff', 'diff.export.markdown.summary', {
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
    });
    const body = String(out.body);
    expect(body).toContain('# NekoDiff export');
    expect(body).toContain('added');
    expect(body).toContain('removed');
  });

  it('refuses an artifact kind it does not accept (runtime enforces accepts)', () => {
    const r = registry();
    const bogus = {
      version: 1,
      kind: 'json.document',
      id: 'art_x',
      producedBy: { toolId: 'json', parserId: 'json.text', parserVersion: 1 },
      producedAt: '2026-05-27T00:00:00.000Z',
      source: { kind: 'paste', bytes: 2 },
      value: {},
    } as const;
    expect(() =>
      runExporter(r, 'diff', 'diff.export.unified', { artifacts: [bogus], diagnostics: [] }),
    ).toThrow(/does not accept artifact kind/);
  });
});
