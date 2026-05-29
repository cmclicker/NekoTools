import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import {
  parseJwtText,
  verifyJwtSignature,
  type JwtVerifyKey,
  type JwtVerifyResult,
} from './jwt-parse.js';

/**
 * NekoJWT sub-app. Free: decode a JWT, see structure/time diagnostics, view
 * header / payload / claims summary, copy. Pro (gated by the suite license):
 * a claims & security audit, SARIF export, and OFFLINE signature
 * verification against a pasted secret / public key / JWK / JWKS. Every byte
 * stays in the browser — no network, ever.
 */

export type JwtViewMode = 'summary' | 'header' | 'payload' | 'audit' | 'sarif';

export interface NekoJwtUiState {
  readonly viewMode: JwtViewMode;
}

export interface JwtAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoJwtUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
  /** Injected verifier (tests); defaults to the real offline Web Crypto fn. */
  readonly verify?: typeof verifyJwtSignature;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

type KeyKind = 'secret' | 'spki-pem' | 'jwk' | 'jwks';

const SAMPLE_INPUT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXVzZXIiLCJpc3MiOiJkZW1vLWlzc3VlciIsImF1ZCI6ImRlbW8tYXBwIiwiZXhwIjo5OTk5OTk5OTk5LCJpYXQiOjE3MTY3MzYwMDB9.test';

const PRO_VIEWS = new Set<JwtViewMode>(['audit', 'sarif']);
const VIEW_MODES: readonly JwtViewMode[] = ['summary', 'header', 'payload', 'audit', 'sarif'];
const VIEW_LABELS: Record<JwtViewMode, string> = {
  summary: 'Summary',
  header: 'Header',
  payload: 'Payload',
  audit: 'Audit ⭐',
  sarif: 'SARIF ⭐',
};

const KEY_KIND_LABELS: Record<KeyKind, string> = {
  secret: 'HMAC secret (HS*)',
  'spki-pem': 'Public key PEM (RS*/PS*/ES*)',
  jwk: 'JWK (JSON)',
  jwks: 'JWKS (JSON)',
};

export function JwtApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
  verify = verifyJwtSignature,
}: JwtAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<JwtViewMode>(initialUiState?.viewMode ?? 'summary');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const [keyKind, setKeyKind] = useState<KeyKind>('secret');
  const [keyText, setKeyText] = useState<string>('');
  const [verifyResult, setVerifyResult] = useState<JwtVerifyResult | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(() => parseJwtText(input, effectiveEntitlement), [input, effectiveEntitlement]);
  const { document } = parsed;
  const proUnlocked = parsed.proUnlocked;

  const isProView = PRO_VIEWS.has(viewMode);
  const copyText =
    viewMode === 'header'
      ? parsed.headerJson
      : viewMode === 'payload'
        ? parsed.payloadJson
        : viewMode === 'audit'
          ? parsed.audit
          : viewMode === 'sarif'
            ? parsed.sarif
            : null;

  const handleCopy = useCallback(async () => {
    if (copyText === null || copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const result = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: result.ok, method: result.method });
  }, [copyText, clipboardDeps]);

  const buildKey = useCallback((): JwtVerifyKey | null => {
    const t = keyText.trim();
    if (t === '') return null;
    if (keyKind === 'secret') return { kind: 'secret', secret: t };
    if (keyKind === 'spki-pem') return { kind: 'spki-pem', pem: t };
    try {
      const json = JSON.parse(t) as Record<string, unknown>;
      if (keyKind === 'jwks') return { kind: 'jwks', jwks: json as { keys: JsonWebKey[] } };
      return { kind: 'jwk', jwk: json as JsonWebKey };
    } catch {
      return null;
    }
  }, [keyKind, keyText]);

  const handleVerify = useCallback(async () => {
    const key = buildKey();
    if (key === null) {
      setVerifyResult({ verified: false, alg: '?', reason: 'paste a valid key / secret (JWK/JWKS must be JSON)' });
      return;
    }
    setVerifying(true);
    try {
      setVerifyResult(await verify(input, key));
    } finally {
      setVerifying(false);
    }
  }, [buildKey, verify, input]);

  return (
    <section className="tool tool--jwt" aria-label="NekoJWT workbench">
      <section className="paste card">
        <label htmlFor="jwt-paste" className="paste__label">
          Paste JWT here:
        </label>
        <textarea
          id="jwt-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={8}
          data-testid="jwt-input"
        />
        <p className="paste__hint">
          Parsing and signature verification run entirely in your browser. No network, no
          telemetry, nothing uploaded.
        </p>

        {/* Pro: offline signature verification (needs a key, so not an export). */}
        {proUnlocked ? (
          <div className="jwt-verify" data-testid="jwt-verify-panel">
            <label className="paste__label" htmlFor="jwt-verify-key">
              Verify signature (offline) ⭐
            </label>
            <div className="jwt-verify__row">
              <select
                className="viewmode__select"
                value={keyKind}
                onChange={(e) => setKeyKind(e.target.value as KeyKind)}
                aria-label="Key type"
                data-testid="jwt-verify-kind"
              >
                {(Object.keys(KEY_KIND_LABELS) as KeyKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KEY_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="copy__btn"
                onClick={handleVerify}
                disabled={verifying}
                data-testid="jwt-verify-run"
              >
                Verify
              </button>
            </div>
            <textarea
              id="jwt-verify-key"
              className="paste__textarea"
              value={keyText}
              onChange={(e) => setKeyText(e.target.value)}
              spellCheck={false}
              rows={3}
              placeholder="Paste the shared secret, public-key PEM, JWK, or JWKS…"
              data-testid="jwt-verify-key"
            />
            {verifyResult !== null ? (
              <p
                className={`jwt-verify__result jwt-verify__result--${verifyResult.verified ? 'ok' : 'fail'}`}
                role="status"
                data-testid="jwt-verify-result"
                data-verified={verifyResult.verified ? 'true' : 'false'}
              >
                {verifyResult.verified
                  ? `✓ Signature verified (${verifyResult.alg}).`
                  : `✗ Not verified (${verifyResult.alg})${verifyResult.reason ? ` — ${verifyResult.reason}` : ''}.`}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="JWT view mode">
            <legend className="visually-hidden">JWT view mode</legend>
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="jwtViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {VIEW_LABELS[m]}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyText === null || copyText === ''}
              data-testid="jwt-copy-output"
            >
              Copy {VIEW_LABELS[viewMode].replace(' ⭐', '')}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="jwt-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: no output to copy.'}
            </p>
          ) : null}
        </div>

        {isProView && !proUnlocked ? (
          <div className="pro-lock" role="status" data-testid="jwt-locked">
            <strong>{viewMode === 'audit' ? 'Claims & security audit' : 'SARIF export'} is a Pro feature.</strong>
            <p>
              {viewMode === 'audit'
                ? 'Audit a token for alg=none, expiry, missing claims, and over-long lifetime.'
                : 'Export the audit as SARIF 2.1.0 to wire NekoJWT into CI code-scanning.'}{' '}
              Unlock with a license key (verified locally, works offline forever).
            </p>
          </div>
        ) : document && viewMode === 'summary' ? (
          <div className="jwt-summary" data-testid="jwt-summary">
            <div className="jwt-section">
              <h3>Header</h3>
              <dl className="jwt-fields">
                <dt>alg</dt>
                <dd>{document.header.alg}</dd>
                {document.header.typ && (
                  <>
                    <dt>typ</dt>
                    <dd>{document.header.typ}</dd>
                  </>
                )}
                {document.header.kid && (
                  <>
                    <dt>kid</dt>
                    <dd>{document.header.kid}</dd>
                  </>
                )}
              </dl>
            </div>

            <div className="jwt-section">
              <h3>Claims</h3>
              <dl className="jwt-claims">
                {document.payload.sub && (
                  <>
                    <dt>sub</dt>
                    <dd>{String(document.payload.sub)}</dd>
                  </>
                )}
                {document.payload.iss && (
                  <>
                    <dt>iss</dt>
                    <dd>{String(document.payload.iss)}</dd>
                  </>
                )}
                {document.payload.aud && (
                  <>
                    <dt>aud</dt>
                    <dd>
                      {Array.isArray(document.payload.aud)
                        ? document.payload.aud.join(', ')
                        : String(document.payload.aud)}
                    </dd>
                  </>
                )}
                {typeof document.payload.iat === 'number' && (
                  <>
                    <dt>iat</dt>
                    <dd>
                      {document.payload.iat} ({new Date(document.payload.iat * 1000).toISOString()})
                    </dd>
                  </>
                )}
                {typeof document.payload.nbf === 'number' && (
                  <>
                    <dt>nbf</dt>
                    <dd>
                      {document.payload.nbf} ({new Date(document.payload.nbf * 1000).toISOString()})
                    </dd>
                  </>
                )}
                {typeof document.payload.exp === 'number' && (
                  <>
                    <dt>exp</dt>
                    <dd>
                      {document.payload.exp} ({new Date(document.payload.exp * 1000).toISOString()})
                    </dd>
                  </>
                )}
              </dl>
            </div>
          </div>
        ) : document && viewMode === 'header' ? (
          <pre className="jwt-output" data-testid="jwt-header-output" aria-label="JWT header (JSON)">
            {parsed.headerJson}
          </pre>
        ) : document && viewMode === 'payload' ? (
          <pre className="jwt-output" data-testid="jwt-payload-output" aria-label="JWT payload (JSON)">
            {parsed.payloadJson}
          </pre>
        ) : document && viewMode === 'audit' ? (
          <pre className="jwt-output" data-testid="jwt-audit-output" aria-label="JWT audit">
            {parsed.audit ?? ''}
          </pre>
        ) : document && viewMode === 'sarif' ? (
          <pre className="jwt-output" data-testid="jwt-sarif-output" aria-label="JWT SARIF">
            {parsed.sarif ?? ''}
          </pre>
        ) : !document ? (
          <div role="status" className="empty-state" data-testid="jwt-no-document">
            No JWT yet. Paste a JWT above (or check the diagnostics below).
          </div>
        ) : null}
      </section>

      <Diagnostics diagnostics={parsed.diagnostics} />
    </section>
  );
}
