import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { assessPasswordInput } from './password-parse.js';

/**
 * NekoPassword sub-app. Wires `@nekotools/lens-password` into the shared
 * web-suite shell as a Security tool tab. Free surface: type/paste a
 * password (masked by default), see a 0–4 strength meter, entropy,
 * crack-time scenarios, and pattern warnings. The password never leaves the
 * input box — the engine returns metrics only.
 */

export type PasswordViewMode = 'overview' | 'json' | 'markdown';

export interface NekoPasswordUiState {
  readonly viewMode: PasswordViewMode;
  readonly reveal: boolean;
}

export interface PasswordAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoPasswordUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SCORE_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];

export function PasswordApp({ initialInput, initialUiState, clipboardDeps }: PasswordAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? '');
  const [viewMode, setViewMode] = useState<PasswordViewMode>(initialUiState?.viewMode ?? 'overview');
  const [reveal, setReveal] = useState<boolean>(initialUiState?.reveal ?? false);
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const result = useMemo(() => assessPasswordInput(input), [input]);
  const report = result.report;
  const score = report?.score ?? 0;

  const handleCopy = useCallback(async () => {
    const text = viewMode === 'json' ? result.json : result.markdown;
    if (text === '' || input === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(text, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [viewMode, result, input, clipboardDeps]);

  return (
    <section className="tool tool--password" aria-label="NekoPassword workbench">
      <section className="paste card">
        <label htmlFor="password-input" className="paste__label">
          Password or passphrase to assess:
        </label>
        <input
          id="password-input"
          type={reveal ? 'text' : 'password'}
          className="password-input"
          value={input}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          data-testid="password-input"
        />
        <label className="cookies-mask">
          <input
            type="checkbox"
            checked={reveal}
            onChange={(e) => setReveal(e.target.checked)}
            data-testid="password-reveal"
          />
          Reveal
        </label>
        <p className="paste__hint">
          Assessed entirely in your browser. The password never leaves this box, is never stored in
          the artifact, and is never uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Password output mode">
            <legend className="visually-hidden">Password output mode</legend>
            {(['overview', 'json', 'markdown'] as const).map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="passwordViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {m === 'overview' ? 'Overview' : m === 'json' ? 'JSON' : 'Markdown'}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={input === ''}
              data-testid="password-copy-output"
            >
              {viewMode === 'json' ? 'Copy JSON' : 'Copy markdown summary'}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="password-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok ? `Copied to clipboard (via ${copyStatus.method}).` : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        {input !== '' && report !== null ? (
          viewMode === 'overview' ? (
            <div data-testid="password-overview">
              <div
                className={`password-meter password-meter--${score}`}
                data-testid="password-meter"
                data-score={score}
                role="meter"
                aria-valuenow={score}
                aria-valuemin={0}
                aria-valuemax={4}
                aria-label="Password strength"
              >
                <span className="password-meter__fill" style={{ width: `${(score / 4) * 100}%` }} />
              </div>
              <p className="password-meter__label" data-testid="password-label">
                <strong>{SCORE_LABELS[score]}</strong> — ~{report.entropyBits} bits of entropy
              </p>

              <h4 className="url-params__heading">Estimated crack time</h4>
              <dl className="url-fields" data-testid="password-crack-times">
                {result.crackTimes.map((t) => (
                  <div className="url-field" key={t.scenario}>
                    <dt>{t.scenario}</dt>
                    <dd>{t.display}</dd>
                  </div>
                ))}
              </dl>

              {report.suggestions.length > 0 ? (
                <>
                  <h4 className="url-params__heading">Suggestions</h4>
                  <ul className="cron-next-runs" data-testid="password-suggestions">
                    {report.suggestions.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : (
            <pre className="toml-output" data-testid="password-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json' ? result.json : result.markdown}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="password-empty">
            Type a password above to see its strength. Nothing is uploaded.
          </div>
        )}

        <Diagnostics diagnostics={result.diagnostics} />
      </section>
    </section>
  );
}
