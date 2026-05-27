import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseJwtText } from './jwt-parse.js';

/**
 * NekoJWT sub-app — Wave 3 PR 2 UI. Wires `@nekotools/lens-jwt` into the
 * shared web-suite shell as the fifth tool tab. Engine-MVP surface: paste
 * JWT, see validation diagnostics (structure, Base64URL, JSON, time claims,
 * signature decode), and view the header/payload/claims, with a copy
 * affordance. The shared `ProSurface` (Free/Pro) renders automatically via
 * the tool registry; this component is the panel only.
 */

export type JwtViewMode = 'summary' | 'header' | 'payload';

export interface NekoJwtUiState {
  readonly viewMode: JwtViewMode;
}

export interface JwtAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoJwtUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

// Sample JWT with common fields: HS256, sub, iss, aud, and future exp
const SAMPLE_INPUT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXVzZXIiLCJpc3MiOiJkZW1vLWlzc3VlciIsImF1ZCI6ImRlbW8tYXBwIiwiZXhwIjo5OTk5OTk5OTk5LCJpYXQiOjE3MTY3MzYwMDB9.test';

export function JwtApp({
  initialInput,
  initialUiState,
  clipboardDeps,
}: JwtAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<JwtViewMode>(initialUiState?.viewMode ?? 'summary');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseJwtText(input), [input]);
  const { document } = parsed;

  const handleCopy = useCallback(async () => {
    const output =
      viewMode === 'header' ? parsed.headerJson : viewMode === 'payload' ? parsed.payloadJson : null;
    if (output === null) {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const result = await copyToClipboard(output, clipboardDeps);
    setCopyStatus({ ok: result.ok, method: result.method });
  }, [viewMode, parsed, clipboardDeps]);

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
          Parsing runs entirely in your browser. No network, no telemetry, nothing uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="JWT view mode">
            <legend className="visually-hidden">JWT view mode</legend>
            <label className={viewMode === 'summary' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="jwtViewMode"
                value="summary"
                checked={viewMode === 'summary'}
                onChange={() => setViewMode('summary')}
              />
              Summary
            </label>
            <label className={viewMode === 'header' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="jwtViewMode"
                value="header"
                checked={viewMode === 'header'}
                onChange={() => setViewMode('header')}
              />
              Header
            </label>
            <label className={viewMode === 'payload' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="jwtViewMode"
                value="payload"
                checked={viewMode === 'payload'}
                onChange={() => setViewMode('payload')}
              />
              Payload
            </label>
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={viewMode === 'summary' || !document}
              data-testid="jwt-copy-output"
            >
              Copy {viewMode === 'header' ? 'Header' : 'Payload'}
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

        {document && viewMode === 'summary' ? (
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
                    <dd>{Array.isArray(document.payload.aud) ? document.payload.aud.join(', ') : String(document.payload.aud)}</dd>
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
        ) : viewMode === 'header' ? (
          <pre
            className="jwt-output"
            data-testid="jwt-header-output"
            aria-label="JWT header (JSON)"
          >
            {parsed.headerJson}
          </pre>
        ) : viewMode === 'payload' ? (
          <pre
            className="jwt-output"
            data-testid="jwt-payload-output"
            aria-label="JWT payload (JSON)"
          >
            {parsed.payloadJson}
          </pre>
        ) : null}

        {!document && viewMode === 'summary' ? (
          <div role="status" className="empty-state" data-testid="jwt-no-document">
            No JWT yet. Paste a JWT above (or check the diagnostics below).
          </div>
        ) : null}
      </section>

      <Diagnostics diagnostics={parsed.diagnostics} />
    </section>
  );
}
