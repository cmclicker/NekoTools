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
  CSV_KIND_TABLE,
  FIXED_CLOCK,
  buildCsvRegistration,
  csvManifest,
  type CsvTableArtifact,
} from '../index.js';

const clock = FIXED_CLOCK('2026-05-28T00:00:00.000Z');
const PRO_EXPORTER_IDS = [
  'csv.export.profile.report',
  'csv.export.schema.json',
  'csv.export.cleaning.recipe',
];

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildCsvRegistration(clock));
  return r;
}

function parse(raw: string, hints: Record<string, unknown> = {}) {
  return runParser(registry(), 'csv', 'csv.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
    hints,
  });
}

function tableOf(raw: string, hints: Record<string, unknown> = {}): CsvTableArtifact {
  return parse(raw, hints).artifacts.find(
    (artifact): artifact is CsvTableArtifact => artifact.kind === CSV_KIND_TABLE,
  )!;
}

describe('NekoCSV: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(csvManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden and a Pro boundary', () => {
    expect(csvManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
    expect(csvManifest.entitlements.pro).toContain('profile.columns');
    expect(csvManifest.entitlements.pro).toContain('infer.schema');
  });

  it('keeps Pro exporters advertised but unregistered in the free build', () => {
    const registration = buildCsvRegistration(clock);
    const registered = new Set(registration.exporters.map((exporter) => exporter.id));
    for (const id of PRO_EXPORTER_IDS) {
      expect(csvManifest.exporters).toContain(id);
      expect(registered.has(id)).toBe(false);
    }
  });
});

describe('NekoCSV: parser', () => {
  it('parses comma CSV with headers into rows and records', () => {
    const table = tableOf('name,age\nAda,37\nLinus,55\n');
    expect(table.value.valid).toBe(true);
    expect(table.value.columns).toEqual(['name', 'age']);
    expect(table.value.rowCount).toBe(2);
    expect(table.value.rows[0]?.record).toEqual({ name: 'Ada', age: '37' });
  });

  it('parses TSV when requested', () => {
    const table = tableOf('name\tlang\nGrace\tCOBOL', { delimiter: 'tab' });
    expect(table.value.delimiter).toBe('tab');
    expect(table.value.rows[0]?.record).toEqual({ name: 'Grace', lang: 'COBOL' });
  });

  it('can parse data without a header row', () => {
    const table = tableOf('Ada,37\nLinus,55', { hasHeader: false });
    expect(table.value.hasHeader).toBe(false);
    expect(table.value.columns).toEqual(['column_1', 'column_2']);
    expect(table.value.rows[1]?.record).toEqual({ column_1: 'Linus', column_2: '55' });
  });

  it('handles quoted delimiters, escaped quotes, and multiline fields', () => {
    const table = tableOf('name,note\nAda,"hello, ""world"""\nLinus,"line 1\nline 2"');
    expect(table.value.rows[0]?.record['note']).toBe('hello, "world"');
    expect(table.value.rows[1]?.record['note']).toBe('line 1\nline 2');
  });

  it('flags duplicate and empty headers', () => {
    const result = parse('name,,name\nAda,,Lovelace');
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toContain('csv.empty_header');
    expect(codes).toContain('csv.duplicate_header');
    const table = result.artifacts[0] as CsvTableArtifact;
    expect(table.value.columns).toEqual(['name', 'column_2', 'name_2']);
  });

  it('flags inconsistent row widths but keeps a padded table artifact', () => {
    const result = parse('a,b\n1\n2,3,4');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'csv.inconsistent_columns',
    );
    const table = result.artifacts[0] as CsvTableArtifact;
    expect(table.value.columnCount).toBe(3);
    expect(table.value.columns).toEqual(['a', 'b', 'column_3']);
    expect(table.value.rows[0]?.cells).toEqual(['1', '', '']);
  });

  it('marks the artifact invalid for an unclosed quote', () => {
    const result = parse('a,b\n"unterminated,2');
    expect(result.diagnostics.find((diagnostic) => diagnostic.code === 'csv.unclosed_quote'))
      .toBeDefined();
    expect((result.artifacts[0] as CsvTableArtifact).value.valid).toBe(false);
  });

  it('emits an empty-input diagnostic and still produces a table artifact', () => {
    const result = parse('   ');
    expect(result.diagnostics.find((diagnostic) => diagnostic.code === 'csv.empty_input'))
      .toBeDefined();
    expect((result.artifacts[0] as CsvTableArtifact).value.rowCount).toBe(0);
  });

  it('produces an artifact that validates against the artifact schema', () => {
    const artifact = tableOf('a,b\n1,2');
    const validation = validate('artifact', artifact);
    expect(validation.ok, validation.errors.join('; ')).toBe(true);
  });
});

describe('NekoCSV: exporters and workspace', () => {
  it('exports a JSON summary', () => {
    const result = parse('name,age\nAda,37');
    const body = runExporter(registry(), 'csv', 'csv.export.summary.json', {
      artifacts: result.artifacts,
      diagnostics: result.diagnostics,
    }).body;
    expect(JSON.parse(String(body))).toMatchObject({ rowCount: 1, columnCount: 2 });
  });

  it('exports a Markdown summary', () => {
    const result = parse('name,age\nAda,37');
    const body = runExporter(registry(), 'csv', 'csv.export.markdown.summary', {
      artifacts: result.artifacts,
      diagnostics: result.diagnostics,
    }).body;
    expect(String(body)).toContain('# NekoCSV summary');
    expect(String(body)).toContain('`name`');
  });

  it('exports normalized CSV with escaped cells', () => {
    const result = parse('name,note\nAda,"hello, world"');
    const body = runExporter(registry(), 'csv', 'csv.export.normalized.csv', {
      artifacts: result.artifacts,
      diagnostics: result.diagnostics,
    }).body;
    expect(String(body)).toBe('name,note\nAda,"hello, world"');
  });

  it('round-trips through the workspace serializer', () => {
    const result = parse('name,age\nAda,37');
    const workspace: Workspace = {
      version: 1,
      id: 'ws_csv',
      toolId: 'csv',
      toolVersion: 1,
      createdAt: clock.now(),
      updatedAt: clock.now(),
      artifacts: result.artifacts,
      diagnostics: result.diagnostics,
      uiState: { delimiter: 'comma', hasHeader: true },
    };
    const restored = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(workspace));
    expect(restored).toEqual(workspace);
  });
});
