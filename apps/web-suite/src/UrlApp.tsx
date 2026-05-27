import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { decodeComponent, encodeComponent } from '@nekotools/lens-url';
import type { Diagnostic } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseUrlInput } from './url-parse.js';

/**
 * NekoURL sub-app. Wires `@nekotools/lens-url` into the shared web-suite
 * shell as another tool tab. Free surface: paste a URL, see its component
 * breakdown + query-parameter table, read the security/privacy hints
 * (credentials present, non-HTTPS, duplicate keys, long query), normalize
 * it, encode/decode components, and copy the normalized URL / params JSON /
 * markdown summary. The shared `ProSurface` (Free/Pro) renders via the tool
 * registry; this component is the panel only. Everything runs locally —
 * NekoURL never resolves or fetches the URL.
 */

export type UrlViewMode = 'components' | 'normalized' | 'params';

export interface NekoUrlUiState {
  readonly viewMode: UrlViewMode;
}

export interface UrlAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoUrlUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

interface EncodeResult {
  readonly kind: 'encode' | 'decode';
  readonly value: string;
  readonly diagnostics: readonly Diagnostic[];
}

const SAMPLE_INPUT =
  'http://api.example.com:8080/v1/items?id=42&id=43&sort=desc&utm_source=demo#section';

function copyLabel(mode: UrlViewMode): string {
  if (mode === 'normalized') return 'Copy normalized URL';
  if (mode === 'params') return 'Copy params JSON';
  return 'Copy markdown summary';
}

export function UrlApp({ initialInput, initialUiState, clipboardDeps }: UrlAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<UrlViewMode>(initialUiState?.viewMode ?? 'components');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const [encodeInput, setEncodeInput] = useState<string>('');
  const [encodeResult, setEncodeResult] = useState<EncodeResult | null>(null);

  const parsed = useMemo(() => parseUrlInput(input), [input]);

  const copyText =
    viewMode === 'normalized'
      ? parsed.normalized ?? ''
      : viewMode === 'params'
        ? parsed.paramsJson
        : parsed.markdown;

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const result = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: result.ok, method: result.method });
  }, [copyText, clipboardDeps]);

  const runEncode = useCallback(() => {
    setEncodeResult({ kind: 'encode', value: encodeComponent(encodeInput), diagnostics: [] });
  }, [encodeInput]);

  const runDecode = useCallback(() => {
    const r = decodeComponent(encodeInput);
    setEncodeResult({ kind: 'decode', value: r.value, diagnostics: r.diagnostics });
  }, [encodeInput]);

  const c = parsed.components;

  return (
    <section className="tool tool--url" aria-label="NekoURL workbench">
      <section className="paste card">
        <label htmlFor="url-paste" className="paste__label">
          Paste a URL here:
        </label>
        <textarea
          id="url-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={3}
          data-testid="url-input"
        />
        <p className="paste__hint">
          Parsing runs entirely in your browser with the native URL API. No network, no
          resolution, no telemetry, nothing uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="URL output mode">
            <legend className="visually-hidden">URL output mode</legend>
            <label className={viewMode === 'components' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="urlViewMode"
                value="components"
                checked={viewMode === 'components'}
                onChange={() => setViewMode('components')}
              />
              Components
            </label>
            <label className={viewMode === 'normalized' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="urlViewMode"
                value="normalized"
                checked={viewMode === 'normalized'}
                onChange={() => setViewMode('normalized')}
              />
              Normalized
            </label>
            <label className={viewMode === 'params' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="urlViewMode"
                value="params"
                checked={viewMode === 'params'}
                onChange={() => setViewMode('params')}
              />
              Params JSON
            </label>
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyText === ''}
              data-testid="url-copy-output"
            >
              {copyLabel(viewMode)}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="url-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        {parsed.valid && c !== null ? (
          viewMode === 'components' ? (
            <div data-testid="url-components">
              <dl className="url-fields">
                <div className="url-field">
                  <dt>scheme</dt>
                  <dd data-testid="url-field-scheme">{c.scheme}</dd>
                </div>
                <div className="url-field">
                  <dt>host</dt>
                  <dd data-testid="url-field-host">{c.host}</dd>
                </div>
                <div className="url-field">
                  <dt>hostname</dt>
                  <dd data-testid="url-field-hostname">{c.hostname}</dd>
                </div>
                <div className="url-field">
                  <dt>port</dt>
                  <dd data-testid="url-field-port">{c.port === '' ? '(scheme default)' : c.port}</dd>
                </div>
                <div className="url-field">
                  <dt>pathname</dt>
                  <dd data-testid="url-field-pathname">{c.pathname}</dd>
                </div>
                <div className="url-field">
                  <dt>hash</dt>
                  <dd data-testid="url-field-hash">{c.hash === '' ? '(none)' : c.hash}</dd>
                </div>
                <div className="url-field">
                  <dt>origin</dt>
                  <dd data-testid="url-field-origin">{c.origin}</dd>
                </div>
                <div className="url-field">
                  <dt>credentials</dt>
                  <dd data-testid="url-field-credentials">
                    {/* Presence only — NekoURL never surfaces the secret values. */}
                    username {c.hasUsername ? 'present' : 'absent'}, password{' '}
                    {c.hasPassword ? 'present' : 'absent'}
                  </dd>
                </div>
              </dl>

              <h4 className="url-params__heading">Query parameters ({c.queryParams.length})</h4>
              {c.queryParams.length > 0 ? (
                <table className="url-params" data-testid="url-params-table">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">key</th>
                      <th scope="col">value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.queryParams.map((p, i) => (
                      <tr key={`${p.key}-${i}`}>
                        <td>{i + 1}</td>
                        <td>{p.key}</td>
                        <td>{p.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty-state" data-testid="url-no-params">
                  No query parameters.
                </p>
              )}
            </div>
          ) : (
            <pre
              className="url-output"
              data-testid="url-output"
              aria-label={viewMode === 'normalized' ? 'Normalized URL output' : 'Query params JSON output'}
            >
              {viewMode === 'normalized' ? parsed.normalized : parsed.paramsJson}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="url-no-document">
            No valid URL yet. Paste an absolute URL above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>

      <section className="encode card" aria-label="Encode and decode">
        <h3 className="encode__heading">Encode / decode a component</h3>
        <label htmlFor="url-encode-input" className="paste__label">
          Text or percent-encoded component:
        </label>
        <textarea
          id="url-encode-input"
          className="paste__textarea"
          value={encodeInput}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setEncodeInput(e.target.value)}
          spellCheck={false}
          rows={2}
          data-testid="url-encode-input"
        />
        <div className="encode__buttons" role="group" aria-label="Encode actions">
          <button type="button" className="copy__btn" onClick={runEncode} data-testid="url-encode-btn">
            encodeURIComponent
          </button>
          <button type="button" className="copy__btn" onClick={runDecode} data-testid="url-decode-btn">
            decodeURIComponent
          </button>
        </div>
        {encodeResult !== null ? (
          <>
            <pre className="url-output" data-testid="url-encode-output" data-kind={encodeResult.kind}>
              {encodeResult.value}
            </pre>
            <Diagnostics diagnostics={encodeResult.diagnostics} />
          </>
        ) : null}
      </section>
    </section>
  );
}
