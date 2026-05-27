import { describe, expect, it } from 'vitest';
import type { Workspace } from '@nekotools/contracts';
import {
  ToolRegistry,
  jsonWorkspaceSerializer,
  runExporter,
  runParser,
  validateManifest,
} from '@nekotools/tool-runtime';

import {
  buildJwtRegistration,
  FIXED_CLOCK,
  jwtManifest,
  JWT_KIND_DOCUMENT,
} from '../index.js';
import type { JwtDocumentArtifact } from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-27T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildJwtRegistration(clock));
  return r;
}

function parseText(raw: string) {
  return runParser(registry(), 'jwt', 'jwt.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function documentOf(raw: string): JwtDocumentArtifact | undefined {
  return parseText(raw).artifacts.find((a) => a.kind === JWT_KIND_DOCUMENT) as
    | JwtDocumentArtifact
    | undefined;
}

// A valid JWT (HS256 signed, exp in future, all standard claims)
const VALID_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaXNzIjoiaXNzdWVyIiwiYXVkIjoiYXVkaWVuY2UiLCJleHAiOjk5OTk5OTk5OTksImlhdCI6MTcxNjczNjAwMCwibmJmIjoxNzE2NzM2MDAwfQ.test';

// Expired JWT (exp in past)
const EXPIRED_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaXNzIjoiaXNzdWVyIiwiYXVkIjoiYXVkaWVuY2UiLCJleHAiOjEsImlhdCI6MCwibmJmIjowfQ.test';

// Token not yet valid (nbf in future)
const NOT_YET_VALID_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaXNzIjoiaXNzdWVyIiwiYXVkIjoiYXVkaWVuY2UiLCJleXAiOjk5OTk5OTk5OTksImlhdCI6MCwibmJmIjo5OTk5OTk5OTk5fQ.test';

// No exp claim
const NO_EXP_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaXNzIjoiaXNzdWVyIn0.test';

// alg=none (security risk)
const ALG_NONE_JWT = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjM0NTY3ODkwIn0.';

describe('NekoJWT: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(jwtManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy', () => {
    expect(jwtManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('declares Pro features even though the free build ships only free ones', () => {
    expect(jwtManifest.entitlements.pro.length).toBeGreaterThan(0);
    expect(jwtManifest.entitlements.free.length).toBeGreaterThan(0);
  });

  it('capabilities reflect current-build truth (no diff, no graph)', () => {
    expect(jwtManifest.capabilities.canSaveWorkspace).toBe(true);
    expect(jwtManifest.capabilities.canExport).toBe(true);
    expect(jwtManifest.capabilities.canDiff).toBe(false);
    expect(jwtManifest.capabilities.canProjectGraph).toBe(false);
  });
});

describe('NekoJWT: monetization safety', () => {
  const registration = buildJwtRegistration(clock);
  const proExporterIds = ['jwt.export.verify.jwks', 'jwt.export.verify.offline', 'jwt.export.claims.policy'];

  it('no Pro exporter is registered in the free build', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) expect(registered.has(id)).toBe(false);
  });

  it('runExporter throws "unknown exporter" for every Pro exporter id', () => {
    const r = registry();
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'jwt', id, { artifacts: [], diagnostics: [] })).toThrow(
        /unknown exporter/,
      );
    }
  });

  it('the manifest declares Pro exporters that are NOT in the registered set', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) {
      expect(jwtManifest.exporters).toContain(id);
      expect(registered.has(id)).toBe(false);
    }
  });
});

describe('NekoJWT: parser', () => {
  it('parses a valid JWT with all standard claims', () => {
    const result = parseText(VALID_JWT);
    const doc = documentOf(VALID_JWT);
    expect(doc).toBeDefined();
    expect(doc!.value.header.alg).toBe('HS256');
    expect(doc!.value.header.typ).toBe('JWT');
    expect(doc!.value.payload.sub).toBe('1234567890');
    expect(doc!.value.payload.iss).toBe('issuer');
    expect(result.diagnostics.some((d) => d.code === 'jwt.signature_not_verified')).toBe(true);
  });

  it('emits error for malformed JWT (wrong segment count)', () => {
    const result = parseText('not.a.valid.jwt.structure');
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics.some((d) => d.code === 'jwt.invalid_segment_count')).toBe(true);
  });

  it('emits error for invalid Base64URL in header', () => {
    const result = parseText('!!!.eyJzdWIiOiIxMjM0NTY3ODkwIn0.test');
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics.some((d) => d.code === 'jwt.invalid_base64url_header')).toBe(true);
  });

  it('emits error for invalid JSON in payload', () => {
    const result = parseText('eyJhbGciOiJIUzI1NiJ9.not-valid-json.test');
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics.some((d) => d.code === 'jwt.invalid_payload_json')).toBe(true);
  });

  it('emits error for alg=none', () => {
    const result = parseText(ALG_NONE_JWT);
    expect(result.diagnostics.some((d) => d.code === 'jwt.alg_none')).toBe(true);
  });

  it('emits info for empty input', () => {
    const result = parseText('   ');
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics.some((d) => d.code === 'jwt.empty_input')).toBe(true);
  });

  it('emits warning for expired token', () => {
    const result = parseText(EXPIRED_JWT);
    expect(result.diagnostics.some((d) => d.code === 'jwt.token_expired')).toBe(true);
  });

  it('emits warning for token not yet valid', () => {
    const result = parseText(NOT_YET_VALID_JWT);
    expect(result.diagnostics.some((d) => d.code === 'jwt.token_not_yet_valid')).toBe(true);
  });

  it('emits warning for missing expiration', () => {
    const result = parseText(NO_EXP_JWT);
    expect(result.diagnostics.some((d) => d.code === 'jwt.missing_expiration')).toBe(true);
  });

  it('always emits signature_not_verified info for valid tokens', () => {
    const result = parseText(VALID_JWT);
    expect(result.diagnostics.some((d) => d.code === 'jwt.signature_not_verified')).toBe(true);
  });
});

describe('NekoJWT: exporters', () => {
  it('exports header as JSON', () => {
    const result = runExporter(
      registry(),
      'jwt',
      'jwt.export.header.json',
      parseText(VALID_JWT),
    );
    expect(result.mimeType).toBe('application/json');
    expect(result.extension).toBe('json');
    const header = JSON.parse(String(result.body));
    expect(header.alg).toBe('HS256');
    expect(header.typ).toBe('JWT');
  });

  it('exports payload as JSON', () => {
    const result = runExporter(
      registry(),
      'jwt',
      'jwt.export.payload.json',
      parseText(VALID_JWT),
    );
    expect(result.mimeType).toBe('application/json');
    expect(result.extension).toBe('json');
    const payload = JSON.parse(String(result.body));
    expect(payload.sub).toBe('1234567890');
    expect(payload.iss).toBe('issuer');
  });

  it('exports claims table as JSON', () => {
    const result = runExporter(
      registry(),
      'jwt',
      'jwt.export.claims.table.json',
      parseText(VALID_JWT),
    );
    expect(result.mimeType).toBe('application/json');
    expect(result.extension).toBe('json');
    const table = JSON.parse(String(result.body));
    expect(Array.isArray(table)).toBe(true);
    expect(table.some((c: { claim: string }) => c.claim === 'sub')).toBe(true);
  });

  it('exports markdown summary with diagnostics', () => {
    const result = runExporter(
      registry(),
      'jwt',
      'jwt.export.summary.markdown',
      parseText(EXPIRED_JWT),
    );
    expect(result.mimeType).toBe('text/markdown');
    expect(result.extension).toBe('md');
    expect(String(result.body)).toContain('# NekoJWT Export');
    expect(String(result.body)).toContain('## Header');
    expect(String(result.body)).toContain('## Claims');
    expect(String(result.body)).toContain('## Diagnostics');
  });
});

describe('NekoJWT: workspace round-trip', () => {
  it('serializes and deserializes artifacts losslessly', () => {
    const serializer = jsonWorkspaceSerializer;
    const parseResult = parseText(VALID_JWT);
    const workspace: Workspace = {
      version: 1,
      id: 'ws_jwt_test',
      toolId: 'jwt',
      toolVersion: 1,
      createdAt: '2026-05-27T00:00:00.000Z',
      updatedAt: '2026-05-27T00:00:00.000Z',
      artifacts: parseResult.artifacts,
      diagnostics: parseResult.diagnostics,
    };

    const serialized = serializer.serialize(workspace);
    const deserialized = serializer.deserialize(serialized);

    expect(deserialized.artifacts).toHaveLength(workspace.artifacts.length);
    expect(deserialized.artifacts[0]?.kind).toBe(JWT_KIND_DOCUMENT);
    const doc = deserialized.artifacts[0] as JwtDocumentArtifact;
    expect(doc.value.payload.sub).toBe('1234567890');
  });
});
