import { describe, expect, it } from 'vitest';
import type { Artifact, Entitlement, Workspace } from '@nekotools/contracts';
import {
  EntitlementError,
  ToolRegistry,
  jsonWorkspaceSerializer,
  runExporter,
  runParser,
  validateManifest,
} from '@nekotools/tool-runtime';
import { validate } from '@nekotools/schemas';

import { FIXED_CLOCK, buildCaseRegistration, caseManifest, tokenize, transformCase } from '../index.js';
import type { CaseParsedArtifact } from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-28T00:00:00.000Z');

const PRO: Entitlement = {
  version: 1,
  licenseId: 'TEST',
  licensee: 'Test User',
  tier: 'pro',
  features: ['*'],
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  signature: 'test',
};

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildCaseRegistration(clock));
  return r;
}

function parse(raw: string) {
  return runParser(registry(), 'case', 'case.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function forms(raw: string) {
  return (parse(raw).artifacts[0] as CaseParsedArtifact).value.entries[0]!.forms;
}

describe('NekoCase: manifest', () => {
  it('passes schema + cross-field validation', () => {
    expect(validateManifest(caseManifest).ok).toBe(true);
  });
  it('declares network-forbidden offline policy', () => {
    expect(caseManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });
  it('free entitlements match the implemented slice', () => {
    expect(new Set(caseManifest.entitlements.free)).toEqual(
      new Set([
        'transform',
        'tokenize',
        'inspect.forms',
        'diagnostics.tokens',
        'export.json',
        'export.normalized',
        'export.markdown.summary',
        'copy.output',
        'workspace.save',
      ]),
    );
  });
});

describe('NekoCase: monetization gating (single-build, entitlement-gated)', () => {
  const registration = buildCaseRegistration(clock);
  const proExporterIds = ['case.export.csv', 'case.export.single-form'];

  it('Pro exporters are declared AND registered as proExporters, not free', () => {
    const free = new Set(registration.exporters.map((e) => e.id));
    const pro = new Set((registration.proExporters ?? []).map((e) => e.id));
    for (const id of proExporterIds) {
      expect(caseManifest.exporters).toContain(id);
      expect(pro.has(id)).toBe(true);
      expect(free.has(id)).toBe(false);
    }
  });

  it('a free caller (default entitlement) is refused with EntitlementError', () => {
    const r = registry();
    const parsed = parse('Hello World\nfooBar');
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'case', id, parsed)).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the CSV + single-form exporters', () => {
    const r = registry();
    const parsed = parse('Hello World\nfooBar');

    const csv = String(runExporter(r, 'case', 'case.export.csv', parsed, PRO).body);
    expect(csv.split('\n')[0]).toContain('input,');
    expect(csv.split('\n')[0]).toContain('camel');
    expect(csv).toContain('Hello World,');

    const single = String(runExporter(r, 'case', 'case.export.single-form', parsed, PRO).body);
    // Default single form is camelCase: "Hello World" → "helloWorld".
    expect(single.split('\n')[0]).toBe('helloWorld');
  });

  it('a truly unknown exporter id still throws "unknown exporter"', () => {
    expect(() =>
      runExporter(registry(), 'case', 'case.export.nope', { artifacts: [], diagnostics: [] }, PRO),
    ).toThrow(/unknown exporter/);
  });
});

describe('NekoCase: tokenization', () => {
  it('splits separators, camelCase humps, and digit boundaries', () => {
    expect(tokenize('fooBarBaz')).toEqual(['foo', 'bar', 'baz']);
    expect(tokenize('foo_bar-baz')).toEqual(['foo', 'bar', 'baz']);
    expect(tokenize('HTTPResponse')).toEqual(['http', 'response']);
    expect(tokenize('item42name')).toEqual(['item', '42', 'name']);
  });
});

describe('NekoCase: forms', () => {
  it('renders the common case forms', () => {
    const f = forms('hello world example');
    expect(f.camel).toBe('helloWorldExample');
    expect(f.pascal).toBe('HelloWorldExample');
    expect(f.snake).toBe('hello_world_example');
    expect(f.constant).toBe('HELLO_WORLD_EXAMPLE');
    expect(f.kebab).toBe('hello-world-example');
    expect(f.title).toBe('Hello World Example');
    expect(f.dot).toBe('hello.world.example');
    expect(f.slug).toBe('hello-world-example');
  });

  it('round-trips between styles via tokenization', () => {
    expect(transformCase('helloWorld').forms.snake).toBe('hello_world');
    expect(transformCase('hello_world').forms.camel).toBe('helloWorld');
    expect(transformCase('hello-world').forms.pascal).toBe('HelloWorld');
  });

  it('handles a single word', () => {
    expect(forms('hello').camel).toBe('hello');
    expect(forms('hello').constant).toBe('HELLO');
  });
});

describe('NekoCase: diagnostics', () => {
  it('emits case.empty_input for empty input', () => {
    expect(parse('   ').diagnostics.map((d) => d.code)).toContain('case.empty_input');
  });
  it('emits case.no_words for a line with no word characters', () => {
    expect(parse('!!! ???').diagnostics.map((d) => d.code)).toContain('case.no_words');
  });
  it('produces a schema-valid artifact', () => {
    expect(validate('artifact', parse('helloWorld').artifacts[0] as Artifact).ok).toBe(true);
  });
});

describe('NekoCase: exporters', () => {
  it('case.export.normalized emits the slug per line', () => {
    const out = runExporter(registry(), 'case', 'case.export.normalized', {
      artifacts: parse('Hello World\nfooBar').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toBe('hello-world\nfoo-bar');
  });
  it('case.export.markdown.summary tabulates forms', () => {
    const out = runExporter(registry(), 'case', 'case.export.markdown.summary', {
      artifacts: parse('fooBar').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toContain('# NekoCase export');
    expect(String(out.body)).toContain('foo_bar');
  });
  it('refuses a foreign artifact kind', () => {
    const foreign = { ...(parse('foo').artifacts[0] as Artifact), kind: 'json.value' } as Artifact;
    expect(() =>
      runExporter(registry(), 'case', 'case.export.json', { artifacts: [foreign], diagnostics: [] }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoCase: workspace round-trip', () => {
  it('round-trips losslessly', () => {
    const parsed = parse('helloWorld\nFOO_BAR');
    const ws: Workspace = {
      version: 1,
      id: 'ws_case_single',
      toolId: 'case',
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
