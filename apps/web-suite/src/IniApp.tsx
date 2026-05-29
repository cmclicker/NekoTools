import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseIniInput } from './ini-parse.js';

/**
 * NekoINI sub-app. Wires `@nekotools/lens-ini` into the shared web-suite
 * shell as a DATA tool tab. Free surface: paste INI / .properties /
 * .editorconfig, see sections + entries, convert to JSON, normalize, and
 * copy. All local.
 */

export type IniViewMode = 'sections' | 'json' | 'normalized' | 'markdown';

export interface NekoIniUiState {
  readonly viewMode: IniViewMode;
}

export interface IniAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoIniUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = [
  '; app configuration',
  'debug = true',
  '',
  '[server]',
  'host = localhost',
  'port = 8080',
  '',
  '[database]',
  'name = app',
  'pool : 10',
].join('\n');

export function IniApp({ initialInput, initialUiState, clipboardDeps }: IniAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<IniViewMode>(initialUiState?.viewMode ?? 'sections');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseIniInput(input), [input]);

  const copyText =
    viewMode === 'json' ? parsed.json : viewMode === 'normalized' ? parsed.normalized : parsed.markdown;
  const copyDisabled = viewMode === 'sections' ? parsed.keyCount === 0 : copyText === '';

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

  const hasContent = parsed.sections.some((s) => s.entries.length > 0);

  return (
    <section className="tool tool--ini" aria-label="NekoINI workbench">
      <section className="paste card">
        <label htmlFor="ini-paste" className="paste__label">
          Paste INI / .properties / .editorconfig:
        </label>
        <textarea
          id="ini-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={10}
          data-testid="ini-input"
        />
        <p className="paste__hint">
          Parsing runs entirely in your browser. Values are kept as raw strings. Nothing uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="INI output mode">
            <legend className="visually-hidden">INI output mode</legend>
            {(['sections', 'json', 'normalized', 'markdown'] as const).map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="iniViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {m === 'sections' ? 'Sections' : m === 'json' ? 'JSON' : m === 'normalized' ? 'Normalized' : 'Markdown'}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyDisabled}
              data-testid="ini-copy-output"
            >
              {viewMode === 'json' ? 'Copy JSON' : viewMode === 'normalized' ? 'Copy normalized' : 'Copy markdown summary'}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="ini-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="ini-stats">
          <li>
            sections: <strong data-testid="ini-stat-sections">{parsed.sectionCount}</strong>
          </li>
          <li>
            keys: <strong data-testid="ini-stat-keys">{parsed.keyCount}</strong>
          </li>
        </ul>

        {hasContent ? (
          viewMode === 'sections' ? (
            <div data-testid="ini-sections">
              {parsed.sections.map((section) => (
                <div className="ini-section" key={section.name || '(global)'}>
                  <h4 className="ini-section__name">{section.name === '' ? '(global)' : section.name}</h4>
                  <dl className="url-fields">
                    {section.entries.map((e) => (
                      <div className="url-field" key={e.key}>
                        <dt>{e.key}</dt>
                        <dd>{e.value === '' ? '(empty)' : e.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          ) : (
            <pre className="toml-output" data-testid="ini-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json' ? parsed.json : viewMode === 'normalized' ? parsed.normalized : parsed.markdown}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="ini-no-document">
            No entries yet. Paste an INI document above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
