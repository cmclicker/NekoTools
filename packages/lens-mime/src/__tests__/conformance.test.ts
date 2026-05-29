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

import { FIXED_CLOCK, buildMimeRegistration, mimeManifest } from '../index.js';
import type { MimeParsedArtifact } from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-28T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildMimeRegistration(clock));
  return r;
}

function parse(raw: string) {
  return runParser(registry(), 'mime', 'mime.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function one(raw: string) {
  return (parse(raw).artifacts[0] as MimeParsedArtifact).value.entries[0]!;
}

describe('NekoMIME: manifest', () => {
  it('passes schema + cross-field validation', () => {
    expect(validateManifest(mimeManifest).ok).toBe(true);
  });
  it('declares network-forbidden offline policy', () => {
    expect(mimeManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });
  it('free entitlements match the implemented slice', () => {
    expect(new Set(mimeManifest.entitlements.free)).toEqual(
      new Set([
        'parse',
        'inspect.parameters',
        'lookup.extension',
        'diagnostics.format',
        'export.json',
        'export.normalized',
        'export.markdown.summary',
        'copy.output',
        'workspace.save',
      ]),
    );
  });
});

describe('NekoMIME: monetization safety', () => {
  const registration = buildMimeRegistration(clock);
  const proExporterIds = ['mime.export.iana-lookup', 'mime.export.csv'];
  it('no Pro exporter is registered, and each throws "unknown exporter"', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    const r = registry();
    for (const id of proExporterIds) {
      expect(registered.has(id)).toBe(false);
      expect(mimeManifest.exporters).toContain(id);
      expect(() => runExporter(r, 'mime', id, { artifacts: [], diagnostics: [] })).toThrow(
        /unknown exporter/,
      );
    }
  });
});

describe('NekoMIME: parsing', () => {
  it('parses a Content-Type with parameters', () => {
    const v = one('text/html; charset=UTF-8').value!;
    expect(v.kind).toBe('content-type');
    expect(v.type).toBe('text');
    expect(v.subtype).toBe('html');
    expect(v.essence).toBe('text/html');
    expect(v.parameters).toEqual([{ name: 'charset', value: 'UTF-8' }]);
    expect(v.extensions).toContain('html');
  });

  it('extracts the structured-syntax suffix', () => {
    expect(one('image/svg+xml').value!.suffix).toBe('xml');
    expect(one('application/ld+json').value!.suffix).toBe('json');
  });

  it('classifies the registration tree', () => {
    expect(one('application/vnd.ms-excel').value!.tree).toBe('vendor');
    expect(one('application/x-tar').value!.tree).toBe('unregistered');
    expect(one('text/plain').value!.tree).toBe('standard');
  });

  it('unquotes a quoted boundary parameter', () => {
    const v = one('multipart/form-data; boundary="--abc123"').value!;
    expect(v.parameters.find((p) => p.name === 'boundary')!.value).toBe('--abc123');
  });

  it('resolves a bare extension to its type', () => {
    const v = one('png').value!;
    expect(v.kind).toBe('extension');
    expect(v.essence).toBe('image/png');
  });

  it('resolves a filename by its extension', () => {
    expect(one('report.pdf').value!.essence).toBe('application/pdf');
    expect(one('.gitignore.json').value!.essence).toBe('application/json');
  });

  it('emits mime.unknown (info) for a valid but untabulated type', () => {
    const result = parse('application/x-custom-thing');
    expect(result.diagnostics.find((d) => d.code === 'mime.unknown')?.severity).toBe('info');
    expect((result.artifacts[0] as MimeParsedArtifact).value.entries[0]!.valid).toBe(true);
  });

  it('emits mime.parse_error for an invalid type / unknown extension', () => {
    expect(parse('not-a-mime').diagnostics.find((d) => d.code === 'mime.parse_error')?.severity).toBe(
      'warning',
    );
    expect(one('text/').valid).toBe(false);
  });

  it('emits mime.empty_input for empty input', () => {
    expect(parse('   ').diagnostics.map((d) => d.code)).toContain('mime.empty_input');
  });

  it('produces a schema-valid artifact', () => {
    expect(validate('artifact', parse('text/html').artifacts[0] as Artifact).ok).toBe(true);
  });
});

describe('NekoMIME: exporters', () => {
  it('mime.export.normalized emits the essence per line', () => {
    const out = runExporter(registry(), 'mime', 'mime.export.normalized', {
      artifacts: parse('text/html; charset=utf-8\npng').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toBe('text/html\nimage/png');
  });
  it('mime.export.markdown.summary tabulates entries', () => {
    const out = runExporter(registry(), 'mime', 'mime.export.markdown.summary', {
      artifacts: parse('image/svg+xml').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toContain('# NekoMIME export');
    expect(String(out.body)).toContain('image/svg+xml');
  });
  it('refuses a foreign artifact kind', () => {
    const foreign = { ...(parse('text/html').artifacts[0] as Artifact), kind: 'json.value' } as Artifact;
    expect(() =>
      runExporter(registry(), 'mime', 'mime.export.json', { artifacts: [foreign], diagnostics: [] }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoMIME: workspace round-trip', () => {
  it('round-trips losslessly', () => {
    const parsed = parse('text/html; charset=UTF-8\nimage/png');
    const ws: Workspace = {
      version: 1,
      id: 'ws_mime_single',
      toolId: 'mime',
      toolVersion: 1,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { viewMode: 'table' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
