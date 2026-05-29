/**
 * Offline JWT signature verification (Pro). Pure Web Crypto — no network,
 * ever. The caller supplies the key material (a shared secret for HS*, or a
 * public key as PEM/JWK/JWKS for RS*, PS*, ES*); we recompute and verify the
 * signature locally. This is an injectable engine function rather than an
 * exporter because verification needs a second input (the key), which the
 * artifact→exporter contract can't carry.
 */

export type JwtVerifyKey =
  | { readonly kind: 'secret'; readonly secret: string }
  | { readonly kind: 'spki-pem'; readonly pem: string }
  | { readonly kind: 'jwk'; readonly jwk: JsonWebKey }
  | { readonly kind: 'jwks'; readonly jwks: { keys: readonly JsonWebKey[] } };

export interface JwtVerifyResult {
  readonly verified: boolean;
  readonly alg: string;
  /** Why verification failed or could not run (absent on success). */
  readonly reason?: string;
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hashFor(alg: string): string {
  if (alg.endsWith('256')) return 'SHA-256';
  if (alg.endsWith('384')) return 'SHA-384';
  if (alg.endsWith('512')) return 'SHA-512';
  throw new Error(`unsupported alg ${alg}`);
}

function curveFor(alg: string): string {
  if (alg === 'ES256') return 'P-256';
  if (alg === 'ES384') return 'P-384';
  if (alg === 'ES512') return 'P-521';
  throw new Error(`unsupported EC alg ${alg}`);
}

interface AlgParams {
  readonly importParams: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams | HmacImportParams;
  readonly verifyParams: AlgorithmIdentifier | RsaPssParams | EcdsaParams;
  readonly format: 'raw' | 'spki' | 'jwk';
}

function paramsFor(alg: string, keyKind: JwtVerifyKey['kind']): AlgParams {
  const hash = hashFor(alg);
  if (alg.startsWith('HS')) {
    return {
      importParams: { name: 'HMAC', hash },
      verifyParams: { name: 'HMAC' },
      format: keyKind === 'jwk' || keyKind === 'jwks' ? 'jwk' : 'raw',
    };
  }
  if (alg.startsWith('RS')) {
    return {
      importParams: { name: 'RSASSA-PKCS1-v1_5', hash },
      verifyParams: { name: 'RSASSA-PKCS1-v1_5' },
      format: keyKind === 'jwk' || keyKind === 'jwks' ? 'jwk' : 'spki',
    };
  }
  if (alg.startsWith('PS')) {
    const saltLength = { 'SHA-256': 32, 'SHA-384': 48, 'SHA-512': 64 }[hash] ?? 32;
    return {
      importParams: { name: 'RSA-PSS', hash },
      verifyParams: { name: 'RSA-PSS', saltLength },
      format: keyKind === 'jwk' || keyKind === 'jwks' ? 'jwk' : 'spki',
    };
  }
  if (alg.startsWith('ES')) {
    return {
      importParams: { name: 'ECDSA', namedCurve: curveFor(alg) },
      verifyParams: { name: 'ECDSA', hash },
      format: keyKind === 'jwk' || keyKind === 'jwks' ? 'jwk' : 'spki',
    };
  }
  throw new Error(`unsupported alg ${alg}`);
}

function pickJwk(jwks: { keys: readonly JsonWebKey[] }, kid: string | undefined): JsonWebKey | undefined {
  if (kid !== undefined) {
    const byKid = jwks.keys.find((k) => (k as { kid?: string }).kid === kid);
    if (byKid !== undefined) return byKid;
  }
  return jwks.keys[0];
}

/**
 * Verify a JWT's signature offline against supplied key material. Never
 * throws — returns `{ verified: false, reason }` on any failure.
 */
export async function verifyJwtSignature(token: string, key: JwtVerifyKey): Promise<JwtVerifyResult> {
  const segments = token.trim().split('.');
  if (segments.length !== 3) return { verified: false, alg: '?', reason: 'token does not have 3 segments' };
  const [headerSeg, payloadSeg, signatureSeg] = segments as [string, string, string];

  let alg: string;
  let kid: string | undefined;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerSeg))) as {
      alg?: string;
      kid?: string;
    };
    if (typeof header.alg !== 'string') return { verified: false, alg: '?', reason: 'header has no alg' };
    alg = header.alg;
    kid = header.kid;
  } catch {
    return { verified: false, alg: '?', reason: 'header is not valid JSON' };
  }

  if (alg === 'none') return { verified: false, alg, reason: 'alg "none" cannot be verified' };

  try {
    const params = paramsFor(alg, key.kind);
    let cryptoKey: CryptoKey;
    if (key.kind === 'secret') {
      cryptoKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(key.secret) as BufferSource,
        params.importParams,
        false,
        ['verify'],
      );
    } else if (key.kind === 'spki-pem') {
      cryptoKey = await crypto.subtle.importKey(
        'spki',
        pemToDer(key.pem) as BufferSource,
        params.importParams,
        false,
        ['verify'],
      );
    } else {
      const jwk = key.kind === 'jwk' ? key.jwk : pickJwk(key.jwks, kid);
      if (jwk === undefined) return { verified: false, alg, reason: 'no matching JWK for kid' };
      cryptoKey = await crypto.subtle.importKey('jwk', jwk, params.importParams, false, ['verify']);
    }

    const data = new TextEncoder().encode(`${headerSeg}.${payloadSeg}`);
    const sig = b64urlToBytes(signatureSeg);
    const ok = await crypto.subtle.verify(
      params.verifyParams,
      cryptoKey,
      sig as BufferSource,
      data as BufferSource,
    );
    return ok ? { verified: true, alg } : { verified: false, alg, reason: 'signature does not match' };
  } catch (e) {
    return { verified: false, alg, reason: e instanceof Error ? e.message : 'verification failed' };
  }
}
