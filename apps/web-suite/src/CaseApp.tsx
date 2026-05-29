import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { CASE_FORMS } from '@nekotools/lens-case';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseCaseInput } from './case-parse.js';

/**
 * NekoCase sub-app. Wires `@nekotools/lens-case` into the shared web-suite
 * shell as a Text tool tab. Free surface: paste phrases/identifiers (one
 * per line), see every case form, and copy JSON / slug list / markdown.
 * All local.
 */

export type CaseViewMode = 'forms' | 'json' | 'normalized' | 'markdown';

export interface NekoCaseUiState {
  readonly viewMode: CaseViewMode;
}

export interface CaseAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoCaseUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = 'helloWorld example';

const FORM_LABELS: Record<string, string> = {
  lower: 'lower',
  upper: 'UPPER',
  title: 'Title Case',
  sentence: 'Sentence case',
  camel: 'camelCase',
  pascal: 'PascalCase',
  snake: 'snake_case',
  constant: 'CONSTANT_CASE',
  kebab: 'kebab-case',
  dot: 'dot.case',
  slug: 'slug',
};

export function CaseApp({ initialInput, initialUiState, clipboardDeps }: CaseAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<CaseViewMode>(initialUiState?.viewMode ?? 'forms');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseCaseInput(input), [input]);
  const first = parsed.entries[0];

  const copyText =
    viewMode === 'json' ? parsed.json : viewMode === 'normalized' ? parsed.normalized : parsed.markdown;
  const copyDisabled = viewMode === 'forms' ? parsed.count === 0 : copyText === '';

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
    <section className="tool tool--case" aria-label="NekoCase workbench">
      <section className="paste card">
        <label htmlFor="case-paste" className="paste__label">
          Paste phrases or identifiers (one per line):
        </label>
        <textarea
          id="case-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={4}
          data-testid="case-input"
        />
        <p className="paste__hint">
          Transformed entirely in your browser — separators, camelCase humps, and digit boundaries
          are all detected. Nothing uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Case output mode">
            <legend className="visually-hidden">Case output mode</legend>
            {(['forms', 'json', 'normalized', 'markdown'] as const).map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="caseViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {m === 'forms' ? 'Forms' : m === 'json' ? 'JSON' : m === 'normalized' ? 'Slug list' : 'Markdown'}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyDisabled}
              data-testid="case-copy-output"
            >
              {viewMode === 'json' ? 'Copy JSON' : viewMode === 'normalized' ? 'Copy slug list' : 'Copy markdown summary'}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="case-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok ? `Copied to clipboard (via ${copyStatus.method}).` : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="case-stats">
          <li>
            entries: <strong data-testid="case-stat-count">{parsed.count}</strong>
          </li>
        </ul>

        {parsed.count > 0 ? (
          viewMode === 'forms' ? (
            first !== undefined ? (
              <dl className="url-fields" data-testid="case-forms">
                {CASE_FORMS.map((f) => (
                  <div className="url-field" key={f}>
                    <dt>{FORM_LABELS[f] ?? f}</dt>
                    <dd data-testid={`case-form-${f}`}>{first.forms[f] || '(empty)'}</dd>
                  </div>
                ))}
              </dl>
            ) : null
          ) : (
            <pre className="toml-output" data-testid="case-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json' ? parsed.json : viewMode === 'normalized' ? parsed.normalized : parsed.markdown}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="case-no-document">
            Nothing to transform yet. Paste a phrase above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
