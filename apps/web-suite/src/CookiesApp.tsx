import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { CookieMode } from '@nekotools/lens-cookies';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseCookieInput } from './cookies-parse.js';

/**
 * NekoCookies sub-app. Wires `@nekotools/lens-cookies` into the shared
 * web-suite shell as a WEB tool tab. Free surface: paste a Set-Cookie or
 * Cookie header, see the cookies broken down with their attributes, read
 * the security/privacy hints (Secure / HttpOnly / SameSite / prefix /
 * expiry), and copy a JSON / normalized / value-free markdown summary.
 * Cookie values are masked by default (they are often session secrets);
 * everything runs locally — no cookie is ever set or sent.
 */

export type CookiesViewMode = 'table' | 'json' | 'normalized' | 'markdown';

export interface NekoCookiesUiState {
  readonly mode: CookieMode;
  readonly viewMode: CookiesViewMode;
  readonly masked: boolean;
}

export interface CookiesAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoCookiesUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = [
  'Set-Cookie: sid=8f3b9c2a1d; Domain=example.com; Path=/; Secure; HttpOnly; SameSite=Lax',
  'Set-Cookie: theme=dark; Path=/',
  'Set-Cookie: __Host-csrf=tok; Path=/; Secure; SameSite=Strict',
].join('\n');

function maskValue(value: string, masked: boolean): string {
  if (!masked) return value;
  if (value === '') return '(empty)';
  return `${'•'.repeat(Math.min(value.length, 8))} (${value.length})`;
}

export function CookiesApp({
  initialInput,
  initialUiState,
  clipboardDeps,
}: CookiesAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [mode, setMode] = useState<CookieMode>(initialUiState?.mode ?? 'set-cookie');
  const [viewMode, setViewMode] = useState<CookiesViewMode>(initialUiState?.viewMode ?? 'table');
  const [masked, setMasked] = useState<boolean>(initialUiState?.masked ?? true);
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseCookieInput(input, mode), [input, mode]);

  const copyText =
    viewMode === 'json'
      ? parsed.json
      : viewMode === 'normalized'
        ? parsed.normalized
        : parsed.markdown; // table view copies the value-free markdown summary

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const result = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: result.ok, method: result.method });
  }, [copyText, clipboardDeps]);

  const isSetCookie = mode === 'set-cookie';

  return (
    <section className="tool tool--cookies" aria-label="NekoCookies workbench">
      <section className="paste card">
        <label htmlFor="cookies-paste" className="paste__label">
          Paste a Set-Cookie or Cookie header:
        </label>
        <textarea
          id="cookies-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={6}
          data-testid="cookies-input"
        />
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Header type">
            <legend className="visually-hidden">Header type</legend>
            <label className={isSetCookie ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="cookieMode"
                value="set-cookie"
                checked={isSetCookie}
                onChange={() => setMode('set-cookie')}
                data-testid="cookies-mode-set-cookie"
              />
              Set-Cookie (response)
            </label>
            <label className={!isSetCookie ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="cookieMode"
                value="cookie"
                checked={!isSetCookie}
                onChange={() => setMode('cookie')}
                data-testid="cookies-mode-cookie"
              />
              Cookie (request)
            </label>
          </fieldset>
          <label className="cookies-mask">
            <input
              type="checkbox"
              checked={masked}
              onChange={(e) => setMasked(e.target.checked)}
              data-testid="cookies-mask"
            />
            Mask values
          </label>
        </div>
        <p className="paste__hint">
          Parsing runs entirely in your browser. No cookie is set, sent, or stored — values stay on
          your machine and are masked by default.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Cookie output mode">
            <legend className="visually-hidden">Cookie output mode</legend>
            {(['table', 'json', 'normalized', 'markdown'] as const).map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="cookiesViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {m === 'table' ? 'Table' : m === 'json' ? 'JSON' : m === 'normalized' ? 'Normalized' : 'Markdown'}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyText === ''}
              data-testid="cookies-copy-output"
            >
              {viewMode === 'json' ? 'Copy JSON' : viewMode === 'normalized' ? 'Copy normalized' : 'Copy markdown summary'}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="cookies-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="cookies-stats">
          <li>
            cookies: <strong data-testid="cookies-stat-count">{parsed.cookies.length}</strong>
          </li>
          <li>
            mode: <strong>{parsed.mode}</strong>
          </li>
        </ul>

        {parsed.cookies.length > 0 ? (
          viewMode === 'table' ? (
            <table className="url-params" data-testid="cookies-table">
              <thead>
                <tr>
                  <th scope="col">name</th>
                  <th scope="col">value</th>
                  {isSetCookie ? (
                    <>
                      <th scope="col">Secure</th>
                      <th scope="col">HttpOnly</th>
                      <th scope="col">SameSite</th>
                      <th scope="col">Path</th>
                      <th scope="col">Domain</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {parsed.cookies.map((c, i) => (
                  <tr key={`${c.name}-${i}`}>
                    <td>{c.name}</td>
                    <td data-testid={`cookies-value-${i}`}>{maskValue(c.value, masked)}</td>
                    {isSetCookie ? (
                      <>
                        <td>{c.attributes.secure ? 'yes' : 'no'}</td>
                        <td>{c.attributes.httpOnly ? 'yes' : 'no'}</td>
                        <td>{c.attributes.sameSite ?? '—'}</td>
                        <td>{c.attributes.path ?? '—'}</td>
                        <td>{c.attributes.domain ?? '—'}</td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre className="toml-output" data-testid="cookies-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json' ? parsed.json : viewMode === 'normalized' ? parsed.normalized : parsed.markdown}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="cookies-no-document">
            No cookies parsed yet. Paste a header above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
