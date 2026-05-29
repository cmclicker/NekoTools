import { describe, expect, it } from 'vitest';
import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import type { Entitlement } from '@nekotools/contracts';

import { FIXED_CLOCK, buildJwtRegistration, JWT_KIND_DOCUMENT } from '../index.js';
import { auditJwt } from '../audit.js';
import { makeDiagnostic } from '../diagnostics.js';
import { signatureFinding, verifyJwtSignature } from '../verify.js';
import type { JwtDocumentArtifact } from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-27T00:00:00.000Z');

const PRO_ENTITLEMENT: Entitlement = {
  version: 1,
  licenseId: 'L',
  licensee: 'B',
  tier: 'pro',
  features: ['*'],
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  signature: 's',
};

function registry(opts?: { largeDocumentBytes?: number }): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildJwtRegistration(clock, opts));
  return r;
}

function parse(raw: string, opts?: { largeDocumentBytes?: number }) {
  return runParser(registry(opts), 'jwt', 'jwt.text', { raw, source: { kind: 'paste', bytes: raw.length } });
}

function docOf(raw: string) {
  return (parse(raw).artifacts.find((a) => a.kind === JWT_KIND_DOCUMENT) as JwtDocumentArtifact | undefined)?.value;
}

// --- base64url + signing helpers (build real tokens for verify tests) ----
function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const enc = (s: string) => new TextEncoder().encode(s);
const b64urlStr = (s: string) => b64url(enc(s));

function derToPem(der: ArrayBuffer, label: string): string {
  let bin = '';
  for (const b of new Uint8Array(der)) bin += String.fromCharCode(b);
  const b64 = (btoa(bin).match(/.{1,64}/g) ?? []).join('\n');
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----`;
}

async function signHS256(payload: object, secret: string): Promise<string> {
  const h = b64urlStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64urlStr(JSON.stringify(payload));
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc(`${h}.${p}`)));
  return `${h}.${p}.${b64url(sig)}`;
}

describe('NekoJWT edge: parser robustness', () => {
  it('rejects a token with the wrong segment count', () => {
    const d = parse('a.b.c.d').diagnostics;
    expect(d.some((x) => x.code === 'jwt.invalid_segment_count')).toBe(true);
  });

  it('trims surrounding whitespace before parsing', () => {
    const doc = docOf(`  eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig  `);
    expect(doc?.payload.sub).toBe('x');
  });

  it('preserves Unicode claim values', () => {
    const token = `${b64urlStr('{"alg":"HS256"}')}.${b64urlStr('{"name":"café ☕ 😀"}')}.sig`;
    expect(docOf(token)?.payload.name).toBe('café ☕ 😀');
  });

  it('flags an oversized token against an injected soft threshold', () => {
    const big = `${b64urlStr('{"alg":"HS256"}')}.${b64urlStr(JSON.stringify({ blob: 'x'.repeat(5000) }))}.sig`;
    const d = parse(big, { largeDocumentBytes: 256 }).diagnostics;
    expect(d.some((x) => x.code === 'jwt.large_document')).toBe(true);
  });

  it('is deterministic across repeated parses', () => {
    const token = `${b64urlStr('{"alg":"HS256"}')}.${b64urlStr('{"sub":"a","exp":9999999999}')}.sig`;
    expect(docOf(token)).toEqual(docOf(token));
  });
});

describe('NekoJWT edge: claims & security audit', () => {
  const result = (raw: string) => {
    const r = parse(raw);
    return auditJwt(docOf(raw), r.diagnostics);
  };

  it('flags alg=none as high', () => {
    const ids = result('eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.').map((f) => f.ruleId);
    expect(ids).toContain('jwt.alg_none');
  });

  it('flags an expired token as high', () => {
    const token = `${b64urlStr('{"alg":"HS256"}')}.${b64urlStr('{"sub":"x","exp":1,"iat":0}')}.test`;
    const f = result(token).find((x) => x.ruleId === 'jwt.token_expired');
    expect(f?.severity).toBe('high');
  });

  it('notes symmetric alg + missing recommended claims', () => {
    const token = `${b64urlStr('{"alg":"HS256"}')}.${b64urlStr('{"exp":9999999999,"iat":1}')}.test`;
    const ids = result(token).map((f) => f.ruleId);
    expect(ids).toContain('jwt.symmetric_alg');
    expect(ids).toContain('jwt.missing_iss');
    expect(ids).toContain('jwt.missing_sub');
  });

  it('flags an over-long lifetime', () => {
    const token = `${b64urlStr('{"alg":"HS256"}')}.${b64urlStr('{"iat":0,"exp":9999999999,"sub":"x","iss":"i","aud":"a"}')}.test`;
    expect(result(token).map((f) => f.ruleId)).toContain('jwt.long_lived');
  });

  it('is clean (info only) for a well-formed token', () => {
    const token = `${b64urlStr('{"alg":"RS256"}')}.${b64urlStr('{"sub":"x","iss":"i","aud":"a","iat":9999999000,"exp":9999999999}')}.test`;
    const findings = result(token);
    expect(findings.every((f) => f.severity !== 'high' && f.severity !== 'medium')).toBe(true);
  });
});

describe('NekoJWT edge: offline signature verification', () => {
  it('verifies a valid HS256 signature with the shared secret', async () => {
    const token = await signHS256({ sub: 'x', exp: 9999999999 }, 'topsecret');
    const r = await verifyJwtSignature(token, { kind: 'secret', secret: 'topsecret' });
    expect(r.verified).toBe(true);
    expect(r.alg).toBe('HS256');
  });

  it('rejects HS256 with the wrong secret', async () => {
    const token = await signHS256({ sub: 'x' }, 'topsecret');
    expect((await verifyJwtSignature(token, { kind: 'secret', secret: 'WRONG' })).verified).toBe(false);
  });

  it('rejects a tampered HS256 payload', async () => {
    const token = await signHS256({ sub: 'x' }, 'topsecret');
    const [h, , s] = token.split('.');
    const tampered = `${h}.${b64urlStr('{"sub":"admin"}')}.${s}`;
    expect((await verifyJwtSignature(tampered, { kind: 'secret', secret: 'topsecret' })).verified).toBe(false);
  });

  it('verifies a valid ES256 signature against the public JWK', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const h = b64urlStr('{"alg":"ES256","typ":"JWT"}');
    const p = b64urlStr('{"sub":"x","exp":9999999999}');
    const sig = new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, enc(`${h}.${p}`)),
    );
    const token = `${h}.${p}.${b64url(sig)}`;
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    expect((await verifyJwtSignature(token, { kind: 'jwk', jwk })).verified).toBe(true);
  });

  it('verifies a valid RS256 signature against the public key PEM', async () => {
    const pair = (await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const h = b64urlStr('{"alg":"RS256","typ":"JWT"}');
    const p = b64urlStr('{"sub":"x","exp":9999999999}');
    const sig = new Uint8Array(
      await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, enc(`${h}.${p}`)),
    );
    const token = `${h}.${p}.${b64url(sig)}`;
    const pem = derToPem(await crypto.subtle.exportKey('spki', pair.publicKey), 'PUBLIC KEY');
    expect((await verifyJwtSignature(token, { kind: 'spki-pem', pem })).verified).toBe(true);
  });

  it('refuses to verify alg=none and never throws on malformed input', async () => {
    expect((await verifyJwtSignature('eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.', { kind: 'secret', secret: 's' })).verified).toBe(false);
    const bad = await verifyJwtSignature('not-a-jwt', { kind: 'secret', secret: 's' });
    expect(bad.verified).toBe(false);
    expect(bad.reason).toBeDefined();
  });

  it('classifies every verification outcome with a stable status discriminator', async () => {
    // verified
    const good = await signHS256({ sub: 'x' }, 'topsecret');
    expect((await verifyJwtSignature(good, { kind: 'secret', secret: 'topsecret' })).status).toBe('verified');
    // invalid (real mismatch — wrong key / tampered)
    expect((await verifyJwtSignature(good, { kind: 'secret', secret: 'WRONG' })).status).toBe('invalid');
    // unverifiable (couldn't even run the check)
    expect((await verifyJwtSignature('eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.', { kind: 'secret', secret: 's' })).status).toBe('unverifiable');
    expect((await verifyJwtSignature('not-a-jwt', { kind: 'secret', secret: 's' })).status).toBe('unverifiable');
  });
});

// The whole point of NekoJWT-as-a-security-artifact: the offline signature
// outcome is not a UI badge, it crosses the engine seam into the audit + SARIF
// via signatureFinding -> diagnostic -> auditJwt. These tests pin that bridge
// with stable codes so a refactor can't quietly sever it.
describe('NekoJWT edge: signature finding bridges verify -> audit', () => {
  it('maps each verify status to a stable diagnostic code + severity', () => {
    expect(signatureFinding({ verified: true, alg: 'HS256', status: 'verified' })).toMatchObject({
      code: 'jwt.signature_verified',
      severity: 'info',
    });
    expect(
      signatureFinding({ verified: false, alg: 'HS256', status: 'invalid', reason: 'x' }),
    ).toMatchObject({ code: 'jwt.signature_invalid', severity: 'error' });
    expect(
      signatureFinding({ verified: false, alg: 'none', status: 'unverifiable', reason: 'y' }),
    ).toMatchObject({ code: 'jwt.signature_unverifiable', severity: 'warning' });
  });

  it('promotes an invalid signature to a HIGH audit finding (no document needed)', () => {
    const f = signatureFinding({ verified: false, alg: 'HS256', status: 'invalid', reason: 'mismatch' });
    const diag = makeDiagnostic('diag_sig', f.severity, f.code, f.message);
    const findings = auditJwt(undefined, [diag]);
    const sig = findings.find((x) => x.ruleId === 'jwt.signature_invalid');
    expect(sig?.severity).toBe('high');
  });

  it('carries the signature outcome through into the SARIF export as an error-level result', () => {
    const token = `${b64urlStr('{"alg":"HS256"}')}.${b64urlStr('{"sub":"x","exp":9999999999}')}.test`;
    const reg = registry();
    const r = runParser(reg, 'jwt', 'jwt.text', { raw: token, source: { kind: 'paste', bytes: token.length } });
    const artifacts = r.artifacts.filter((a) => a.kind === JWT_KIND_DOCUMENT);

    const f = signatureFinding({ verified: false, alg: 'HS256', status: 'invalid', reason: 'mismatch' });
    const diagnostics = [...r.diagnostics, makeDiagnostic('diag_sig', f.severity, f.code, f.message)];

    const out = String(
      runExporter(
        reg,
        'jwt',
        'jwt.export.sarif',
        { artifacts, diagnostics },
        PRO_ENTITLEMENT,
      ).body,
    );
    const sarif = JSON.parse(out) as { runs: { results: { ruleId: string; level: string }[] }[] };
    const sig = sarif.runs[0]?.results.find((x) => x.ruleId === 'jwt.signature_invalid');
    expect(sig?.level).toBe('error');
  });
});
