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

import {
  FIXED_CLOCK,
  URL_KIND_PARSED,
  buildUrlRegistration,
  decodeComponent,
  encodeComponent,
  normalizeQuery,
  urlManifest,
} from '../index.js';
import type { UrlParsedArtifact } from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-27T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildUrlRegistration(clock));
  return r;
}

function parseText(raw: string) {
  return runParser(registry(), 'url', 'url.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function parsedOf(raw: string): UrlParsedArtifact {
  return parseText(raw).artifacts.find((a) => a.kind === URL_KIND_PARSED) as UrlParsedArtifact;
}

describe('NekoURL: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(urlManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy (no resolution, ever)', () => {
    expect(urlManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('declares Pro features even though the free build ships only free ones', () => {
    expect(urlManifest.entitlements.pro.length).toBeGreaterThan(0);
    expect(urlManifest.entitlements.free).toContain('parse');
  });

  it('declares an out-of-scope list covering redirects + network resolution', () => {
    expect(urlManifest.outOfScope.some((s) => /redirect/i.test(s))).toBe(true);
    expect(urlManifest.outOfScope.some((s) => /fetch|resolution|DNS/i.test(s))).toBe(true);
  });

  it('capabilities reflect current-build truth (no diff, no graph)', () => {
    expect(urlManifest.capabilities.canSaveWorkspace).toBe(true);
    expect(urlManifest.capabilities.canExport).toBe(true);
    expect(urlManifest.capabilities.canDiff).toBe(false);
    expect(urlManifest.capabilities.canProjectGraph).toBe(false);
  });
});

describe('NekoURL: monetization safety', () => {
  const registration = buildUrlRegistration(clock);
  const proExporterIds = ['url.export.batch.audit', 'url.export.redaction.preset'];

  it('no Pro exporter is registered in the free build', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) expect(registered.has(id)).toBe(false);
  });

  it('runExporter throws "unknown exporter" for every Pro exporter id', () => {
    const r = registry();
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'url', id, { artifacts: [], diagnostics: [] })).toThrow(
        /unknown exporter/,
      );
    }
  });

  it('the manifest declares Pro exporters that are NOT in the registered set', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) {
      expect(urlManifest.exporters).toContain(id);
      expect(registered.has(id)).toBe(false);
    }
  });

  it('free entitlements match exactly the implemented vertical-slice set', () => {
    const expectedFree = new Set([
      'parse',
      'inspect.components',
      'encode.component',
      'decode.component',
      'normalize.query',
      'diagnostics.security',
      'export.params.json',
      'export.normalized',
      'export.markdown.summary',
      'copy.normalized',
      'workspace.save',
    ]);
    expect(new Set(urlManifest.entitlements.free)).toEqual(expectedFree);
  });
});

describe('NekoURL: url.text parser', () => {
  it('parses an absolute URL into its components', () => {
    const result = parseText('https://example.com:8080/a/b?x=1&y=2#frag');
    expect(result.artifacts).toHaveLength(1);
    const c = (result.artifacts[0] as UrlParsedArtifact).value.components!;
    expect(c.protocol).toBe('https:');
    expect(c.scheme).toBe('https');
    expect(c.host).toBe('example.com:8080');
    expect(c.hostname).toBe('example.com');
    expect(c.port).toBe('8080');
    expect(c.pathname).toBe('/a/b');
    expect(c.search).toBe('?x=1&y=2');
    expect(c.hash).toBe('#frag');
    expect(c.origin).toBe('https://example.com:8080');
    expect(c.queryParams).toEqual([
      { key: 'x', value: '1' },
      { key: 'y', value: '2' },
    ]);
    expect(c.hasUsername).toBe(false);
    expect(c.hasPassword).toBe(false);
  });

  it('emits url.empty_input (info) for empty input and still produces an artifact', () => {
    const result = parseText('   ');
    expect(result.artifacts.find((a) => a.kind === URL_KIND_PARSED)).toBeDefined();
    expect((result.artifacts[0] as UrlParsedArtifact).value.valid).toBe(false);
    expect(result.diagnostics.find((d) => d.code === 'url.empty_input')?.severity).toBe('info');
  });

  it('emits url.relative_url (warning) for a relative reference', () => {
    const result = parseText('/just/a/path?x=1');
    const diag = result.diagnostics.find((d) => d.code === 'url.relative_url');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('warning');
    expect((result.artifacts[0] as UrlParsedArtifact).value.valid).toBe(false);
  });

  it('emits url.parse_error (error) for genuinely malformed input, without throwing', () => {
    const call = () => parseText('http://');
    expect(call).not.toThrow();
    const result = call();
    const diag = result.diagnostics.find((d) => d.code === 'url.parse_error');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('error');
    expect((result.artifacts[0] as UrlParsedArtifact).value.valid).toBe(false);
  });

  it('emits url.credentials_present (warning) and never stores the secret', () => {
    const result = parseText('https://alice:s3cr3t-token@example.com/path');
    const diag = result.diagnostics.find((d) => d.code === 'url.credentials_present');
    expect(diag?.severity).toBe('warning');

    const value = (result.artifacts[0] as UrlParsedArtifact).value;
    expect(value.components?.hasUsername).toBe(true);
    expect(value.components?.hasPassword).toBe(true);
    // The sanitized href is credential-free, and the secret appears nowhere
    // in the serialized artifact (workspace round-trips never persist it).
    expect(value.sanitizedHref).toBe('https://example.com/path');
    expect(JSON.stringify(result.artifacts[0])).not.toContain('s3cr3t-token');
  });

  it('emits url.insecure_scheme (warning) for http and suggests https', () => {
    const result = parseText('http://example.com/');
    const diag = result.diagnostics.find((d) => d.code === 'url.insecure_scheme');
    expect(diag?.severity).toBe('warning');
    expect(diag?.hint).toMatch(/https/);
  });

  it('does NOT warn url.insecure_scheme for https', () => {
    const result = parseText('https://example.com/');
    expect(result.diagnostics.find((d) => d.code === 'url.insecure_scheme')).toBeUndefined();
  });

  it('does NOT warn url.insecure_scheme for non-transport schemes (mailto)', () => {
    const result = parseText('mailto:dev@example.com');
    expect(result.diagnostics.find((d) => d.code === 'url.insecure_scheme')).toBeUndefined();
  });

  it('emits url.duplicate_query_key (warning) once per repeated key, with the count', () => {
    const result = parseText('https://example.com/?a=1&a=2&b=3');
    const dups = result.diagnostics.filter((d) => d.code === 'url.duplicate_query_key');
    expect(dups).toHaveLength(1);
    expect(dups[0]?.severity).toBe('warning');
    expect(dups[0]?.message).toContain('"a"');
    expect(dups[0]?.message).toContain('2 times');
    // Duplicates are preserved in order in the parsed params.
    expect((result.artifacts[0] as UrlParsedArtifact).value.components?.queryParams).toEqual([
      { key: 'a', value: '1' },
      { key: 'a', value: '2' },
      { key: 'b', value: '3' },
    ]);
  });

  it('emits url.long_query (info) above the soft threshold', () => {
    const r = new ToolRegistry();
    r.register(buildUrlRegistration(clock, { longQueryBytes: 4 }));
    const result = runParser(r, 'url', 'url.text', {
      raw: 'https://example.com/?q=hello-world',
      source: { kind: 'paste', bytes: 34 },
    });
    expect(result.diagnostics.find((d) => d.code === 'url.long_query')?.severity).toBe('info');
  });

  it('produces a url.parsed artifact that validates against the artifact schema', () => {
    const validation = validate('artifact', parsedOf('https://example.com/a?b=2'));
    expect(validation.ok, validation.errors.join('; ')).toBe(true);
  });
});

describe('NekoURL: encode/decode utilities', () => {
  it('encodeComponent percent-encodes reserved characters', () => {
    expect(encodeComponent('a b&c=d')).toBe('a%20b%26c%3Dd');
  });

  it('decodeComponent decodes a valid component', () => {
    const r = decodeComponent('a%20b%26c');
    expect(r.ok).toBe(true);
    expect(r.value).toBe('a b&c');
    expect(r.diagnostics).toHaveLength(0);
  });

  it('decodeComponent never throws on a malformed escape; emits url.decode_error', () => {
    const call = () => decodeComponent('%E0%A4%A');
    expect(call).not.toThrow();
    const r = call();
    expect(r.ok).toBe(false);
    expect(r.value).toBe('%E0%A4%A');
    expect(r.diagnostics[0]?.code).toBe('url.decode_error');
    expect(r.diagnostics[0]?.severity).toBe('error');
  });

  it('normalizeQuery sorts params by key and tolerates a leading "?"', () => {
    expect(normalizeQuery('b=2&a=1')).toBe('a=1&b=2');
    expect(normalizeQuery('?b=2&a=1')).toBe('a=1&b=2');
  });
});

describe('NekoURL: exporters', () => {
  it('url.export.params.json emits the ordered query params as a JSON array', () => {
    const out = runExporter(registry(), 'url', 'url.export.params.json', {
      artifacts: [parsedOf('https://example.com/?a=1&b=two')],
      diagnostics: [],
    });
    expect(JSON.parse(String(out.body))).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: 'two' },
    ]);
  });

  it('url.export.normalized lowercases host, drops the default port, and sorts query', () => {
    const out = runExporter(registry(), 'url', 'url.export.normalized', {
      artifacts: [parsedOf('HTTPS://Example.COM:443/a?b=2&a=1#x')],
      diagnostics: [],
    });
    expect(String(out.body)).toBe('https://example.com/a?a=1&b=2#x');
  });

  it('url.export.normalized strips embedded credentials', () => {
    const out = runExporter(registry(), 'url', 'url.export.normalized', {
      artifacts: [parsedOf('https://user:s3cr3t-token@example.com/p?z=1')],
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toBe('https://example.com/p?z=1');
    expect(body).not.toContain('s3cr3t-token');
  });

  it('url.export.markdown.summary describes components, params, and diagnostics', () => {
    const parsed = parseText('http://example.com/p?a=1&a=2');
    const out = runExporter(registry(), 'url', 'url.export.markdown.summary', {
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
    });
    const body = String(out.body);
    expect(body).toContain('# NekoURL export');
    expect(body).toContain('valid: yes');
    expect(body).toContain('`example.com`');
    expect(body).toContain('## Query parameters');
    expect(body).toContain('url.insecure_scheme');
    expect(body).toContain('url.duplicate_query_key');
  });

  it('the parsed exporter refuses a foreign artifact kind (runtime enforces accepts)', () => {
    const foreign = { ...parsedOf('https://example.com/'), kind: 'json.value' } as unknown as Artifact;
    for (const id of ['url.export.params.json', 'url.export.normalized', 'url.export.markdown.summary']) {
      expect(() =>
        runExporter(registry(), 'url', id, { artifacts: [foreign], diagnostics: [] }),
      ).toThrow(/does not accept artifact kind/);
    }
  });
});

describe('NekoURL: workspace round-trip', () => {
  it('a parsed-URL workspace round-trips losslessly', () => {
    const parsed = parseText('https://example.com/a?x=1&y=2#h');
    const ws: Workspace = {
      version: 1,
      id: 'ws_url_single',
      toolId: 'url',
      toolVersion: 1,
      createdAt: '2026-05-27T00:00:00.000Z',
      updatedAt: '2026-05-27T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { viewMode: 'components' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
