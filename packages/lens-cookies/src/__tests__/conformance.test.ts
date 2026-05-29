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

import { FIXED_CLOCK, buildCookiesRegistration, cookiesManifest } from '../index.js';
import type { CookieParsedArtifact } from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-28T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildCookiesRegistration(clock));
  return r;
}

function parse(raw: string, mode?: 'set-cookie' | 'cookie') {
  return runParser(registry(), 'cookies', 'cookie.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
    ...(mode ? { hints: { mode } } : {}),
  });
}

function setOf(raw: string, mode?: 'set-cookie' | 'cookie') {
  return (parse(raw, mode).artifacts[0] as CookieParsedArtifact).value;
}

function codes(raw: string, mode?: 'set-cookie' | 'cookie'): string[] {
  return parse(raw, mode).diagnostics.map((d) => d.code);
}

describe('NekoCookies: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(cookiesManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy', () => {
    expect(cookiesManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('free entitlements match exactly the implemented vertical-slice set', () => {
    expect(new Set(cookiesManifest.entitlements.free)).toEqual(
      new Set([
        'parse.set-cookie',
        'parse.cookie',
        'inspect.attributes',
        'diagnostics.security',
        'export.json',
        'export.normalized',
        'export.markdown.summary',
        'copy.output',
        'mask.value',
        'workspace.save',
      ]),
    );
  });
});

describe('NekoCookies: monetization safety', () => {
  const registration = buildCookiesRegistration(clock);
  const proExporterIds = ['cookie.export.audit.report', 'cookie.export.policy.preset'];

  it('no Pro exporter is registered, and each throws "unknown exporter"', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    const r = registry();
    for (const id of proExporterIds) {
      expect(registered.has(id)).toBe(false);
      expect(cookiesManifest.exporters).toContain(id);
      expect(() => runExporter(r, 'cookies', id, { artifacts: [], diagnostics: [] })).toThrow(
        /unknown exporter/,
      );
    }
  });
});

describe('NekoCookies: cookie.text parser', () => {
  it('parses a Set-Cookie with attributes', () => {
    const set = setOf('sid=abc123; Domain=example.com; Path=/; Secure; HttpOnly; SameSite=Lax');
    expect(set.mode).toBe('set-cookie');
    expect(set.cookies).toHaveLength(1);
    const c = set.cookies[0]!;
    expect(c.name).toBe('sid');
    expect(c.value).toBe('abc123');
    expect(c.attributes).toMatchObject({
      domain: 'example.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    });
  });

  it('parses multiple name=value pairs in cookie mode', () => {
    const set = setOf('a=1; b=2; c=3', 'cookie');
    expect(set.mode).toBe('cookie');
    expect(set.cookies.map((c) => [c.name, c.value])).toEqual([
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
    ]);
  });

  it('strips a leading "Set-Cookie:" / "Cookie:" prefix', () => {
    expect(setOf('Set-Cookie: x=1; Secure').cookies[0]!.name).toBe('x');
    expect(setOf('Cookie: a=1; b=2', 'cookie').cookies).toHaveLength(2);
  });

  it('parses Max-Age numerically and keeps unknown attributes in extras', () => {
    const c = setOf('t=1; Max-Age=3600; Priority=High').cookies[0]!;
    expect(c.attributes.maxAge).toBe(3600);
    expect(c.attributes.extras).toEqual({ Priority: 'High' });
  });

  it('emits cookie.empty_input (info) for empty input', () => {
    expect(codes('   ')).toContain('cookie.empty_input');
    expect(setOf('   ').valid).toBe(false);
  });

  it('emits cookie.parse_error (error) for a segment with no "="', () => {
    const result = parse('not-a-cookie');
    expect(result.diagnostics.find((d) => d.code === 'cookie.parse_error')?.severity).toBe('error');
    expect((result.artifacts[0] as CookieParsedArtifact).value.valid).toBe(false);
  });

  it('flags insecure + no-httponly + missing-samesite on a bare cookie', () => {
    const c = codes('sid=x');
    expect(c).toContain('cookie.insecure');
    expect(c).toContain('cookie.no_httponly');
    expect(c).toContain('cookie.samesite_missing');
  });

  it('does NOT flag insecure/httponly/samesite when all are set securely', () => {
    const c = codes('sid=x; Secure; HttpOnly; SameSite=Strict');
    expect(c).not.toContain('cookie.insecure');
    expect(c).not.toContain('cookie.no_httponly');
    expect(c).not.toContain('cookie.samesite_missing');
  });

  it('flags SameSite=None without Secure', () => {
    expect(codes('sid=x; SameSite=None; HttpOnly')).toContain('cookie.samesite_none_insecure');
  });

  it('flags __Secure- and __Host- prefix violations', () => {
    expect(codes('__Secure-sid=x; HttpOnly')).toContain('cookie.secure_prefix');
    // __Host- requires Secure + Path=/ + no Domain; this one sets a Domain.
    expect(codes('__Host-sid=x; Secure; Path=/; Domain=example.com')).toContain('cookie.host_prefix');
  });

  it('does NOT flag a correct __Host- cookie', () => {
    expect(codes('__Host-sid=x; Secure; Path=/; HttpOnly; SameSite=Lax')).not.toContain(
      'cookie.host_prefix',
    );
  });

  it('flags an expired cookie (Max-Age<=0 and past Expires) relative to the clock', () => {
    expect(codes('a=1; Max-Age=0; Secure; HttpOnly; SameSite=Lax')).toContain('cookie.expired');
    expect(
      codes('b=1; Expires=Wed, 21 Oct 2015 07:28:00 GMT; Secure; HttpOnly; SameSite=Lax'),
    ).toContain('cookie.expired');
  });

  it('flags duplicate cookie names', () => {
    expect(codes('a=1; Secure; HttpOnly; SameSite=Lax\na=2; Secure; HttpOnly; SameSite=Lax')).toContain(
      'cookie.duplicate_name',
    );
  });

  it('produces a cookie.parsed artifact that validates against the artifact schema', () => {
    const validation = validate('artifact', parse('sid=x; Secure').artifacts[0] as Artifact);
    expect(validation.ok, validation.errors.join('; ')).toBe(true);
  });
});

describe('NekoCookies: exporters', () => {
  it('cookie.export.json emits the structured cookies', () => {
    const out = runExporter(registry(), 'cookies', 'cookie.export.json', {
      artifacts: parse('sid=abc; Secure; HttpOnly').artifacts,
      diagnostics: [],
    });
    const parsed = JSON.parse(String(out.body));
    expect(parsed[0]).toMatchObject({ name: 'sid', value: 'abc' });
    expect(parsed[0].attributes).toMatchObject({ secure: true, httpOnly: true });
  });

  it('cookie.export.normalized re-serializes with canonical attribute order', () => {
    const out = runExporter(registry(), 'cookies', 'cookie.export.normalized', {
      artifacts: parse('sid=abc; HttpOnly; Path=/; Secure; SameSite=Lax').artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toBe('sid=abc; Path=/; SameSite=Lax; Secure; HttpOnly');
  });

  it('cookie.export.markdown.summary reports value length, never the value', () => {
    const parsed = parse('session=supersecrettoken; Secure; HttpOnly; SameSite=Lax');
    const out = runExporter(registry(), 'cookies', 'cookie.export.markdown.summary', {
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
    });
    const body = String(out.body);
    expect(body).toContain('# NekoCookies export');
    expect(body).toContain('`session`');
    expect(body).toContain('16'); // "supersecrettoken" is 16 bytes — length, not the value
    expect(body).not.toContain('supersecrettoken');
  });

  it('the exporter refuses a foreign artifact kind', () => {
    const foreign = { ...(parse('a=1').artifacts[0] as Artifact), kind: 'json.value' } as Artifact;
    for (const id of ['cookie.export.json', 'cookie.export.normalized', 'cookie.export.markdown.summary']) {
      expect(() =>
        runExporter(registry(), 'cookies', id, { artifacts: [foreign], diagnostics: [] }),
      ).toThrow(/does not accept artifact kind/);
    }
  });
});

describe('NekoCookies: workspace round-trip', () => {
  it('a parsed-cookie workspace round-trips losslessly', () => {
    const parsed = parse('sid=abc; Domain=example.com; Path=/; Secure; HttpOnly; SameSite=Lax');
    const ws: Workspace = {
      version: 1,
      id: 'ws_cookie_single',
      toolId: 'cookies',
      toolVersion: 1,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { mode: 'set-cookie', masked: true },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
