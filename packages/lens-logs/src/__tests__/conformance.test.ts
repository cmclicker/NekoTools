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
  buildLogsRegistration,
  computeHistogram,
  computeSummary,
  logsManifest,
  normalizeLevel,
  parseLine,
  parseTimestamp,
} from '../index.js';
import type {
  LogDocumentArtifact,
  LogFilterResult,
  LogHistogramArtifact,
  LogSummaryArtifact,
} from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-21T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildLogsRegistration(clock));
  return r;
}

function parse(raw: string) {
  return runParser(registry(), 'logs', 'log.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

describe('NekoLogs: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(logsManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy', () => {
    expect(logsManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('declares Pro features (advertising); free build includes parse', () => {
    expect(logsManifest.entitlements.pro.length).toBeGreaterThan(0);
    expect(logsManifest.entitlements.free).toContain('parse');
  });

  it('out-of-scope list covers tailing, ingestion, and query-language execution', () => {
    expect(logsManifest.outOfScope.some((s) => s.includes('tailing'))).toBe(true);
    expect(logsManifest.outOfScope.some((s) => s.includes('ingestion'))).toBe(true);
    expect(logsManifest.outOfScope.some((s) => s.includes('query language'))).toBe(true);
  });

  it('capabilities reflect current-build truth (canDiff + canProjectGraph false)', () => {
    expect(logsManifest.capabilities.canSaveWorkspace).toBe(true);
    expect(logsManifest.capabilities.canExport).toBe(true);
    expect(logsManifest.capabilities.canDiff).toBe(false);
    expect(logsManifest.capabilities.canProjectGraph).toBe(false);
  });
});

describe('NekoLogs: monetization safety', () => {
  const registration = buildLogsRegistration(clock);

  const proExporterIds = [
    'log.export.report.incident',
    'log.export.histogram.svg',
    'log.export.patterns.clusters',
  ];
  const proProjectorIds = ['log.graph.trace'];

  it('no Pro exporter is registered in the free build', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) expect(registered.has(id)).toBe(false);
  });

  it('no graph projector is registered in the free build', () => {
    const projectors = registration.graphProjectors ?? [];
    expect(projectors).toHaveLength(0);
    for (const id of proProjectorIds) {
      expect(projectors.find((p) => p.id === id)).toBeUndefined();
    }
  });

  it('runExporter rejects every Pro exporter id', () => {
    const r = registry();
    for (const id of proExporterIds) {
      expect(() =>
        runExporter(r, 'logs', id, { artifacts: [], diagnostics: [] }),
      ).toThrow(/unknown exporter/);
    }
  });

  it('manifest declares Pro exporters that are NOT registered', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) {
      expect(logsManifest.exporters).toContain(id);
      expect(registered.has(id)).toBe(false);
    }
  });

  it('free entitlements match the exact Phase 2.x.1 engine MVP set', () => {
    // UI entitlements (view.table, view.text, view.summary, search,
    // filter.ui, copy.line, copy.message) are deliberately ABSENT —
    // they land in Phase 2.x.2 with their implementation.
    const expectedFree = new Set([
      'parse',
      'validate',
      'filter',
      'summary.basic',
      'histogram.basic',
      'export.text.plain',
      'export.plaintext.messages',
      'export.json.entries',
      'export.csv.entries',
      'export.markdown.summary',
      'workspace.save',
    ]);
    expect(new Set(logsManifest.entitlements.free)).toEqual(expectedFree);
  });
});

describe('NekoLogs: log.text parser', () => {
  it('parses JSON-per-line entries, lifting time/level/msg', () => {
    const raw = '{"time":"2026-05-21T10:00:00Z","level":"error","msg":"boom","req":"42"}\n';
    const result = parse(raw);
    const doc = (result.artifacts[0] as LogDocumentArtifact).value;
    expect(doc.entries).toHaveLength(1);
    const e = doc.entries[0]!;
    expect(e.format).toBe('json');
    expect(e.level).toBe('error');
    expect(e.message).toBe('boom');
    expect(e.timestamp).toBe('2026-05-21T10:00:00.000Z');
    expect(e.fields['req']).toBe('42');
  });

  it('parses logfmt lines', () => {
    const raw = 'level=warn msg="disk almost full" pct=92\n';
    const result = parse(raw);
    const e = (result.artifacts[0] as LogDocumentArtifact).value.entries[0]!;
    expect(e.format).toBe('logfmt');
    expect(e.level).toBe('warn');
    expect(e.message).toBe('disk almost full');
    expect(e.fields['pct']).toBe('92');
  });

  it('parses plaintext lines with leading timestamp + bracket level', () => {
    const raw = '2026-05-21 09:30:00 [INFO] service started\n';
    const e = (parse(raw).artifacts[0] as LogDocumentArtifact).value.entries[0]!;
    expect(e.format).toBe('plain');
    expect(e.level).toBe('info');
    expect(e.message).toBe('service started');
    expect(e.timestamp).toBe('2026-05-21T09:30:00.000Z');
  });

  it('keeps an unstructured line as a plaintext message and counts it unparseable', () => {
    const raw = 'just some free text with no structure\n';
    const result = parse(raw);
    const e = (result.artifacts[0] as LogDocumentArtifact).value.entries[0]!;
    expect(e.format).toBe('plain');
    expect(e.level).toBeUndefined();
    expect(e.message).toBe('just some free text with no structure');
    expect(result.diagnostics.find((d) => d.code === 'log.unparseable_line')).toBeDefined();
  });

  it('skips blank lines (they are not entries)', () => {
    const raw = 'info: a\n\n\ninfo: b\n';
    const doc = (parse(raw).artifacts[0] as LogDocumentArtifact).value;
    expect(doc.entries).toHaveLength(2);
    expect(doc.entries.map((e) => e.lineNumber)).toEqual([1, 4]);
  });

  it('emits log.empty_input (info) for whitespace-only input', () => {
    const result = parse('   \n  \n');
    expect(result.diagnostics.find((d) => d.code === 'log.empty_input')?.severity).toBe('info');
  });

  it('emits log.mixed_formats (info) when formats are mixed', () => {
    const raw = '{"msg":"a"}\nplain line here\n';
    const result = parse(raw);
    expect(result.diagnostics.find((d) => d.code === 'log.mixed_formats')).toBeDefined();
  });

  it('emits exactly three artifacts: document + summary + histogram', () => {
    const result = parse('{"level":"info","msg":"x","time":"2026-05-21T10:00:00Z"}\n');
    expect(result.artifacts.map((a) => a.kind)).toEqual([
      'log.document',
      'log.summary',
      'log.histogram',
    ]);
  });

  it('the derived summary is consistent with the document (pure-function property)', () => {
    const raw =
      '{"level":"error","msg":"e1","time":"2026-05-21T10:00:00Z"}\n' +
      '{"level":"info","msg":"i1","time":"2026-05-21T10:05:00Z"}\n';
    const result = parse(raw);
    const doc = result.artifacts[0] as LogDocumentArtifact;
    const summary = result.artifacts[1] as LogSummaryArtifact;
    const recomputed = computeSummary(doc.id, doc.value);
    expect(summary.value).toEqual(recomputed);
    expect(summary.value.total).toBe(2);
    expect(summary.value.byLevel['error']).toBe(1);
    expect(summary.value.byLevel['info']).toBe(1);
  });

  it('the derived histogram is consistent with the document (pure-function property)', () => {
    const raw =
      '{"level":"error","msg":"e1","time":"2026-05-21T10:00:00Z"}\n' +
      '{"level":"info","msg":"i1","time":"2026-05-21T11:00:00Z"}\n';
    const result = parse(raw);
    const doc = result.artifacts[0] as LogDocumentArtifact;
    const histogram = result.artifacts[2] as LogHistogramArtifact;
    expect(histogram.value).toEqual(computeHistogram(doc.id, doc.value));
    expect(histogram.value.bucketCount).toBeGreaterThan(0);
  });

  it('emits log.large_document (info) above a small threshold (UTF-8 bytes)', () => {
    const r = new ToolRegistry();
    r.register(buildLogsRegistration(clock, { largeDocumentBytes: 4 }));
    const result = runParser(r, 'logs', 'log.text', {
      raw: 'info: é over the limit\n',
      source: { kind: 'paste', bytes: 24 },
    });
    expect(result.diagnostics.find((d) => d.code === 'log.large_document')?.severity).toBe('info');
  });

  it('produces a document artifact that validates against the artifact schema', () => {
    const result = parse('info: hello\n');
    expect(validate('artifact', result.artifacts[0]).ok).toBe(true);
  });
});

describe('NekoLogs: log.filter parser', () => {
  function docArtifact(raw: string): LogDocumentArtifact {
    return parse(raw).artifacts[0] as LogDocumentArtifact;
  }

  const sample =
    '{"level":"info","msg":"a","time":"2026-05-21T10:00:00Z","svc":"api"}\n' +
    '{"level":"error","msg":"b","time":"2026-05-21T10:10:00Z","svc":"db"}\n' +
    '{"level":"warn","msg":"c","time":"2026-05-21T10:20:00Z","svc":"api"}\n';

  it('filters by minLevel', () => {
    const doc = docArtifact(sample);
    const result = runParser(registry(), 'logs', 'log.filter', {
      raw: '',
      source: { kind: 'derived', from: [doc.id] },
      hints: { document: doc.value, documentArtifactId: doc.id, filter: { minLevel: 'warn' } },
    });
    const v = result.artifacts[0]!.value as LogFilterResult;
    expect(v.matchedCount).toBe(2);
    expect(v.entries.map((e) => e.level)).toEqual(['error', 'warn']);
  });

  it('filters by messageContains', () => {
    const doc = docArtifact(sample);
    const result = runParser(registry(), 'logs', 'log.filter', {
      raw: '',
      source: { kind: 'derived', from: [doc.id] },
      hints: { document: doc.value, documentArtifactId: doc.id, filter: { messageContains: 'b' } },
    });
    expect((result.artifacts[0]!.value as LogFilterResult).matchedCount).toBe(1);
  });

  it('filters by fieldEquals', () => {
    const doc = docArtifact(sample);
    const result = runParser(registry(), 'logs', 'log.filter', {
      raw: '',
      source: { kind: 'derived', from: [doc.id] },
      hints: {
        document: doc.value,
        documentArtifactId: doc.id,
        filter: { fieldEquals: { key: 'svc', value: 'api' } },
      },
    });
    expect((result.artifacts[0]!.value as LogFilterResult).matchedCount).toBe(2);
  });

  it('filters by time range (since/until)', () => {
    const doc = docArtifact(sample);
    const result = runParser(registry(), 'logs', 'log.filter', {
      raw: '',
      source: { kind: 'derived', from: [doc.id] },
      hints: {
        document: doc.value,
        documentArtifactId: doc.id,
        filter: { since: '2026-05-21T10:05:00Z', until: '2026-05-21T10:15:00Z' },
      },
    });
    const v = result.artifacts[0]!.value as LogFilterResult;
    expect(v.matchedCount).toBe(1);
    expect(v.entries[0]!.message).toBe('b');
  });

  it('emits log.filter.invalid (error) for an unknown minLevel and no artifact', () => {
    const doc = docArtifact(sample);
    const result = runParser(registry(), 'logs', 'log.filter', {
      raw: '',
      source: { kind: 'derived', from: [doc.id] },
      hints: { document: doc.value, documentArtifactId: doc.id, filter: { minLevel: 'loud' } },
    });
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe('log.filter.invalid');
  });

  it('emits log.filter.invalid when no document is provided (does not throw)', () => {
    const call = () =>
      runParser(registry(), 'logs', 'log.filter', {
        raw: '',
        source: { kind: 'derived', from: [] },
        hints: { filter: { minLevel: 'info' } },
      });
    expect(call).not.toThrow();
    expect(call().diagnostics[0]?.code).toBe('log.filter.invalid');
  });

  describe('PR #16 audit blocker: malformed filters fail closed (never throw)', () => {
    function runWithFilter(filter: unknown) {
      const doc = docArtifact(sample);
      const call = () =>
        runParser(registry(), 'logs', 'log.filter', {
          raw: '',
          source: { kind: 'derived', from: [doc.id] },
          hints: { document: doc.value, documentArtifactId: doc.id, filter },
        });
      expect(call).not.toThrow();
      return call();
    }

    const cases: { name: string; filter: unknown }[] = [
      { name: 'filter: null', filter: null },
      { name: 'filter: "bad"', filter: 'bad' },
      { name: 'filter: 123', filter: 123 },
      { name: 'filter: []', filter: [] },
      { name: 'fieldEquals: null', filter: { fieldEquals: null } },
      { name: 'fieldEquals missing value', filter: { fieldEquals: { key: 'svc' } } },
      { name: 'fieldEquals non-string value', filter: { fieldEquals: { key: 'svc', value: 5 } } },
      { name: 'since: 123', filter: { since: 123 } },
      { name: 'until: {}', filter: { until: {} } },
      { name: 'messageContains: 123', filter: { messageContains: 123 } },
      { name: 'levelIn: "info"', filter: { levelIn: 'info' } },
      { name: 'levelIn: ["bogus"]', filter: { levelIn: ['bogus'] } },
    ];

    for (const c of cases) {
      it(`${c.name} -> log.filter.invalid, no artifact`, () => {
        const result = runWithFilter(c.filter);
        expect(result.artifacts).toHaveLength(0);
        expect(result.diagnostics[0]?.code).toBe('log.filter.invalid');
      });
    }

    it('filter: null is treated as "missing" via ?? {} only when undefined — null is rejected', () => {
      // Guard against a regression where `null ?? {}` would silently
      // pass an empty filter. `null` must be an explicit invalid.
      const result = runWithFilter(null);
      expect(result.diagnostics[0]?.code).toBe('log.filter.invalid');
    });

    it('an entirely absent filter hint defaults to match-all (valid, not invalid)', () => {
      const doc = docArtifact(sample);
      const result = runParser(registry(), 'logs', 'log.filter', {
        raw: '',
        source: { kind: 'derived', from: [doc.id] },
        hints: { document: doc.value, documentArtifactId: doc.id },
      });
      expect(result.diagnostics).toHaveLength(0);
      const v = result.artifacts[0]!.value as LogFilterResult;
      expect(v.matchedCount).toBe(v.totalCount);
    });
  });
});

describe('NekoLogs: exporters', () => {
  const sample =
    '{"level":"info","msg":"started","time":"2026-05-21T10:00:00Z"}\n' +
    '{"level":"error","msg":"crash, boom","time":"2026-05-21T10:10:00Z"}\n';

  function docArtifact(): LogDocumentArtifact {
    return parse(sample).artifacts[0] as LogDocumentArtifact;
  }
  function summaryArtifact(): LogSummaryArtifact {
    return parse(sample).artifacts[1] as LogSummaryArtifact;
  }

  it('text.plain re-emits raw lines', () => {
    const out = runExporter(registry(), 'logs', 'log.export.text.plain', {
      artifacts: [docArtifact()],
      diagnostics: [],
    });
    expect(String(out.body).split('\n')).toHaveLength(2);
    expect(String(out.body)).toContain('"msg":"started"');
  });

  it('plaintext.messages emits messages only', () => {
    const out = runExporter(registry(), 'logs', 'log.export.plaintext.messages', {
      artifacts: [docArtifact()],
      diagnostics: [],
    });
    expect(String(out.body)).toBe('started\ncrash, boom');
  });

  it('json.entries emits a structured array', () => {
    const out = runExporter(registry(), 'logs', 'log.export.json.entries', {
      artifacts: [docArtifact()],
      diagnostics: [],
    });
    const parsed = JSON.parse(String(out.body)) as { level: string }[];
    expect(parsed).toHaveLength(2);
    expect(parsed[1]!.level).toBe('error');
  });

  it('csv.entries quotes cells containing commas', () => {
    const out = runExporter(registry(), 'logs', 'log.export.csv.entries', {
      artifacts: [docArtifact()],
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body.split('\n')[0]).toBe('line,timestamp,level,message,fields');
    // "crash, boom" contains a comma → must be quoted.
    expect(body).toContain('"crash, boom"');
    expect(out.extension).toBe('csv');
  });

  it('markdown.summary renders counts by level + top messages', () => {
    const out = runExporter(registry(), 'logs', 'log.export.markdown.summary', {
      artifacts: [summaryArtifact()],
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toContain('# NekoLogs summary');
    expect(body).toContain('error: 1');
    expect(body).toContain('info: 1');
  });

  it('entry-row exporters also accept a log.filter-result', () => {
    const doc = docArtifact();
    const filtered = runParser(registry(), 'logs', 'log.filter', {
      raw: '',
      source: { kind: 'derived', from: [doc.id] },
      hints: { document: doc.value, documentArtifactId: doc.id, filter: { minLevel: 'error' } },
    });
    const out = runExporter(registry(), 'logs', 'log.export.plaintext.messages', {
      artifacts: filtered.artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toBe('crash, boom');
  });

  it('markdown.summary refuses a log.document (runtime enforces accepts)', () => {
    expect(() =>
      runExporter(registry(), 'logs', 'log.export.markdown.summary', {
        artifacts: [docArtifact()],
        diagnostics: [],
      }),
    ).toThrow(/does not accept artifact kind/);
  });

  it('text.plain refuses a log.summary (runtime enforces accepts)', () => {
    expect(() =>
      runExporter(registry(), 'logs', 'log.export.text.plain', {
        artifacts: [summaryArtifact()],
        diagnostics: [],
      }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoLogs: helpers', () => {
  it('normalizeLevel maps aliases case-insensitively', () => {
    expect(normalizeLevel('WARN')).toBe('warn');
    expect(normalizeLevel('warning')).toBe('warn');
    expect(normalizeLevel('err')).toBe('error');
    expect(normalizeLevel('critical')).toBe('fatal');
    expect(normalizeLevel('nonsense')).toBeUndefined();
    expect(normalizeLevel(undefined)).toBeUndefined();
  });

  it('parseTimestamp handles ISO and space-separated forms; rejects junk', () => {
    expect(parseTimestamp('2026-05-21T10:00:00Z')?.iso).toBe('2026-05-21T10:00:00.000Z');
    expect(parseTimestamp('2026-05-21 10:00:00')).not.toBeNull();
    expect(parseTimestamp('not a date')).toBeNull();
    expect(parseTimestamp('42')).toBeNull();
  });

  it('parseLine returns a plain entry for prose containing an = sign (not logfmt)', () => {
    const p = parseLine('the answer is x = y in this sentence');
    expect(p.format).toBe('plain');
  });
});

describe('NekoLogs: workspace round-trip', () => {
  it('document + summary + histogram round-trip losslessly', () => {
    const result = parse(
      '{"level":"info","msg":"a","time":"2026-05-21T10:00:00Z"}\ninfo: plain b\n',
    );
    const ws: Workspace = {
      version: 1,
      id: 'ws_logs',
      toolId: 'logs',
      toolVersion: 1,
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z',
      artifacts: result.artifacts,
      diagnostics: result.diagnostics,
      uiState: { viewMode: 'table', filter: { minLevel: 'info' } },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });

  it('a filter-result artifact round-trips losslessly in a multi-artifact workspace', () => {
    const result = parse('{"level":"error","msg":"x","time":"2026-05-21T10:00:00Z"}\n');
    const doc = result.artifacts[0] as LogDocumentArtifact;
    const filtered = runParser(registry(), 'logs', 'log.filter', {
      raw: '',
      source: { kind: 'derived', from: [doc.id] },
      hints: { document: doc.value, documentArtifactId: doc.id, filter: { minLevel: 'warn' } },
    });
    const ws: Workspace = {
      version: 1,
      id: 'ws_logs_filter',
      toolId: 'logs',
      toolVersion: 1,
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z',
      artifacts: [...result.artifacts, ...filtered.artifacts],
      diagnostics: [...result.diagnostics, ...filtered.diagnostics],
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
