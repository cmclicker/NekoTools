import { describe, expect, it } from 'vitest';
import type { Entitlement, Workspace } from '@nekotools/contracts';
import {
  EntitlementError,
  ToolRegistry,
  jsonWorkspaceSerializer,
  runExporter,
  runParser,
  validateManifest,
} from '@nekotools/tool-runtime';
import { validate } from '@nekotools/schemas';

import {
  buildHeadersRegistration,
  FIXED_CLOCK,
  headersManifest,
} from '../index.js';
import type { HeadersDocumentArtifact } from '../kinds.js';

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

const INSECURE = 'Content-Type: text/html';
const HARDENED =
  "strict-transport-security: max-age=63072000\ncontent-security-policy: default-src 'self'\nx-content-type-options: nosniff\nx-frame-options: DENY\nreferrer-policy: no-referrer";

const clock = FIXED_CLOCK('2026-05-27T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildHeadersRegistration(clock));
  return r;
}

function parse(raw: string) {
  return runParser(registry(), 'headers', 'headers.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function documentOf(raw: string): HeadersDocumentArtifact {
  return parse(raw).artifacts[0] as HeadersDocumentArtifact;
}

const RESPONSE = `HTTP/1.1 200 OK
Content-Type: application/json
Strict-Transport-Security: max-age=63072000
Content-Security-Policy: default-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer`;

describe('NekoHeaders: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(headersManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy', () => {
    expect(headersManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('declares Pro features and a free parse capability', () => {
    expect(headersManifest.entitlements.pro.length).toBeGreaterThan(0);
    expect(headersManifest.entitlements.free).toContain('parse');
  });

  it('out-of-scope covers making requests / TLS', () => {
    expect(headersManifest.outOfScope.some((s) => /requests|fetch/i.test(s))).toBe(true);
    expect(headersManifest.outOfScope.some((s) => /TLS|certificate/i.test(s))).toBe(true);
  });

  it('capabilities reflect current-build truth (no diff, no graph)', () => {
    expect(headersManifest.capabilities.canDiff).toBe(false);
    expect(headersManifest.capabilities.canProjectGraph).toBe(false);
    expect(headersManifest.capabilities.canExport).toBe(true);
  });
});

describe('NekoHeaders: monetization gating (single-build, entitlement-gated)', () => {
  const proExporterIds = ['headers.export.audit.report', 'headers.export.cors-csp.pack'];

  it('Pro exporters are declared AND registered as proExporters, not free', () => {
    const reg = buildHeadersRegistration(clock);
    const proIds = new Set((reg.proExporters ?? []).map((e) => e.id));
    for (const id of proExporterIds) {
      expect(headersManifest.exporters).toContain(id);
      expect(proIds.has(id)).toBe(true);
      expect(reg.exporters.some((e) => e.id === id)).toBe(false);
    }
  });

  it('declares the matching pro entitlement features', () => {
    expect(headersManifest.entitlements.pro).toContain('security.audit');
    expect(headersManifest.entitlements.pro).toContain('packs.cors-csp');
  });

  it('a free caller (default entitlement) is refused with EntitlementError', () => {
    const r = registry();
    const parsed = parse(INSECURE);
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'headers', id, parsed)).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the audit report + CORS/CSP pack exporters', () => {
    const r = registry();
    const parsed = parse(INSECURE);

    const auditReport = String(runExporter(r, 'headers', 'headers.export.audit.report', parsed, PRO).body);
    expect(auditReport).toContain('# NekoHeaders security audit');
    expect(auditReport).toContain('grade:');
    // Insecure input (no HSTS/CSP) must not grade clean.
    expect(auditReport).not.toContain('grade: A');

    const pack = String(runExporter(r, 'headers', 'headers.export.cors-csp.pack', parsed, PRO).body);
    expect(pack).toContain('# NekoHeaders hardened CORS + CSP pack');
    expect(pack).toContain('Strict-Transport-Security:');
    expect(pack).toContain('Content-Security-Policy:');
  });

  it('the audit grades a hardened header set as A (clean)', () => {
    const r = registry();
    const auditReport = String(
      runExporter(r, 'headers', 'headers.export.audit.report', parse(HARDENED), PRO).body,
    );
    expect(auditReport).toContain('grade: A');
  });

  it('the pack annotates already-present headers', () => {
    const r = registry();
    const pack = String(runExporter(r, 'headers', 'headers.export.cors-csp.pack', parse(HARDENED), PRO).body);
    expect(pack).toContain('(already set');
  });

  it('a truly unknown exporter id still throws "unknown exporter"', () => {
    expect(() =>
      runExporter(registry(), 'headers', 'headers.export.nope', { artifacts: [], diagnostics: [] }, PRO),
    ).toThrow(/unknown exporter/);
  });

  it('free entitlements match exactly the implemented engine-MVP set', () => {
    const expectedFree = new Set([
      'parse',
      'validate',
      'security.hints.basic',
      'export.json',
      'export.markdown.summary',
      'workspace.save',
    ]);
    expect(new Set(headersManifest.entitlements.free)).toEqual(expectedFree);
  });
});

describe('NekoHeaders: headers.text parser', () => {
  it('parses Name: value headers and the start line', () => {
    const doc = documentOf('HTTP/1.1 200 OK\nContent-Type: text/html\nServer: nginx\n');
    expect(doc.value.startLine).toBe('HTTP/1.1 200 OK');
    expect(doc.value.entries.map((e) => [e.name, e.value])).toEqual([
      ['Content-Type', 'text/html'],
      ['Server', 'nginx'],
    ]);
  });

  it('emits headers.malformed_line (error) for a line with no colon', () => {
    const result = parse('Content-Type: text/html\nthis is not a header\n');
    const diag = result.diagnostics.find((d) => d.code === 'headers.malformed_line');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('error');
    expect(diag?.span?.startLine).toBe(2);
    // The valid header still parses (best-effort).
    expect((result.artifacts[0] as HeadersDocumentArtifact).value.entries).toHaveLength(1);
  });

  it('emits headers.duplicate_header (warning) on a repeated header (case-insensitive)', () => {
    const result = parse('Set-Cookie: a=1\nset-cookie: b=2\n');
    const diag = result.diagnostics.find((d) => d.code === 'headers.duplicate_header');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('warning');
  });

  it('emits headers.empty_input (info) for empty input and still produces an artifact', () => {
    const result = parse('   \n');
    expect(result.artifacts).toHaveLength(1);
    expect((result.artifacts[0] as HeadersDocumentArtifact).value.entries).toEqual([]);
    expect(result.diagnostics.find((d) => d.code === 'headers.empty_input')?.severity).toBe('info');
  });

  it('emits headers.security_hint (info) for absent security headers', () => {
    const result = parse('Content-Type: text/html\n');
    const hints = result.diagnostics.filter((d) => d.code === 'headers.security_hint');
    // All five recommended headers are absent here.
    expect(hints.length).toBe(5);
    expect(hints.every((d) => d.severity === 'info')).toBe(true);
  });

  it('does NOT emit security hints that are present', () => {
    const result = parse(RESPONSE);
    expect(result.diagnostics.find((d) => d.code === 'headers.security_hint')).toBeUndefined();
  });

  it('emits headers.large_document (info) above the soft threshold', () => {
    const r = new ToolRegistry();
    r.register(buildHeadersRegistration(clock, { largeDocumentBytes: 4 }));
    const result = runParser(r, 'headers', 'headers.text', {
      raw: 'Content-Type: text/html\n',
      source: { kind: 'paste', bytes: 24 },
    });
    expect(result.diagnostics.find((d) => d.code === 'headers.large_document')?.severity).toBe(
      'info',
    );
  });

  it('produces an artifact that validates against the artifact schema', () => {
    const validation = validate('artifact', documentOf('Content-Type: text/html\n'));
    expect(validation.ok, validation.errors.join('; ')).toBe(true);
  });
});

describe('NekoHeaders: exporters', () => {
  it('headers.export.json emits a name -> value object (arrays for duplicates)', () => {
    const r = registry();
    const out = runExporter(r, 'headers', 'headers.export.json', {
      artifacts: [documentOf('Content-Type: text/html\nSet-Cookie: a=1\nSet-Cookie: b=2\n')],
      diagnostics: [],
    });
    const parsed = JSON.parse(String(out.body));
    expect(parsed['Content-Type']).toBe('text/html');
    expect(parsed['Set-Cookie']).toEqual(['a=1', 'b=2']);
  });

  it('headers.export.markdown.summary lists headers + diagnostics', () => {
    const r = registry();
    const out = runExporter(r, 'headers', 'headers.export.markdown.summary', {
      artifacts: [documentOf('Content-Type: text/html\n')],
      diagnostics: [
        { version: 1, id: 'd1', severity: 'info', code: 'headers.test', message: 'sample' },
      ],
    });
    const body = String(out.body);
    expect(body).toContain('# NekoHeaders export');
    expect(body).toContain('`Content-Type`: text/html');
    expect(body).toContain('sample');
  });
});

describe('NekoHeaders: workspace round-trip', () => {
  it('a header document round-trips losslessly', () => {
    const parsed = parse(RESPONSE);
    const ws: Workspace = {
      version: 1,
      id: 'ws_headers',
      toolId: 'headers',
      toolVersion: 1,
      createdAt: '2026-05-27T00:00:00.000Z',
      updatedAt: '2026-05-27T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { viewMode: 'table' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
