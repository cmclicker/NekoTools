import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseCspInput } from './csp-parse.js';

/**
 * NekoCSP sub-app. Wires `@nekotools/lens-csp` into the shared web-suite
 * shell as a Web tool tab. Free surface: paste a Content-Security-Policy,
 * see each directive + its sources and a list of security findings, and
 * copy JSON / normalized / markdown. All local.
 */

export type CspViewMode = 'directives' | 'json' | 'normalized' | 'markdown';

export interface NekoCspUiState {
  readonly viewMode: CspViewMode;
}

export interface CspAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoCspUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT =
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.example.com; img-src * data:; object-src 'none'";

export function CspApp({ initialInput, initialUiState, clipboardDeps }: CspAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<CspViewMode>(initialUiState?.viewMode ?? 'directives');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseCspInput(input), [input]);

  const copyText =
    viewMode === 'json' ? parsed.json : viewMode === 'normalized' ? parsed.normalized : parsed.markdown;
  const copyDisabled = viewMode === 'directives' ? parsed.directiveCount === 0 : copyText === '';

  const handleCopy = useCallback(async () => {
    const text =
      viewMode === 'json' ? parsed.json : viewMode === 'normalized' ? parsed.normalized : parsed.markdown;
    if (text === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(text, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [viewMode, parsed, clipboardDeps]);

  return (
    <section className="tool tool--csp" aria-label="NekoCSP workbench">
      <section className="paste card">
        <label htmlFor="csp-paste" className="paste__label">
          Paste a Content-Security-Policy header:
        </label>
        <textarea
          id="csp-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={4}
          data-testid="csp-input"
        />
        <p className="paste__hint">
          Audited entirely in your browser — no policy is fetched, evaluated against a live page, or
          uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="CSP output mode">
            <legend className="visually-hidden">CSP output mode</legend>
            {(['directives', 'json', 'normalized', 'markdown'] as const).map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="cspViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {m === 'directives' ? 'Directives' : m === 'json' ? 'JSON' : m === 'normalized' ? 'Normalized' : 'Markdown'}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyDisabled}
              data-testid="csp-copy-output"
            >
              {viewMode === 'json' ? 'Copy JSON' : viewMode === 'normalized' ? 'Copy normalized' : 'Copy markdown summary'}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="csp-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok ? `Copied to clipboard (via ${copyStatus.method}).` : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="csp-stats">
          <li>
            directives: <strong data-testid="csp-stat-directives">{parsed.directiveCount}</strong>
          </li>
          <li>
            findings: <strong data-testid="csp-stat-findings">{parsed.findings.length}</strong>
          </li>
        </ul>

        {parsed.directiveCount > 0 ? (
          viewMode === 'directives' ? (
            <div data-testid="csp-directives">
              <table className="url-params">
                <thead>
                  <tr>
                    <th scope="col">directive</th>
                    <th scope="col">sources</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.directives.map((d) => (
                    <tr key={d.name}>
                      <td>{d.name}</td>
                      <td>{d.sources.join(' ') || '(empty)'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.findings.length > 0 ? (
                <ul className="cron-next-runs" data-testid="csp-findings">
                  {parsed.findings.map((f, i) => (
                    <li key={i} data-severity={f.severity}>
                      <strong>{f.severity.toUpperCase()}</strong>
                      {f.directive ? ` [${f.directive}]` : ''} — {f.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state" data-testid="csp-clean">
                  No findings — looks locked down.
                </p>
              )}
            </div>
          ) : (
            <pre className="toml-output" data-testid="csp-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json' ? parsed.json : viewMode === 'normalized' ? parsed.normalized : parsed.markdown}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="csp-no-document">
            No directives yet. Paste a CSP header above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
