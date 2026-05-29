import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseDurationInput } from './duration-parse.js';

/**
 * NekoDuration sub-app. Wires `@nekotools/lens-duration` into the shared
 * web-suite shell as a Utility tool tab. Free surface: paste durations
 * (ISO-8601 / humanized / seconds, one per line), see total seconds +
 * normalized ISO + human form, and copy JSON / ISO list / markdown. Local.
 */

export type DurationViewMode = 'table' | 'json' | 'normalized' | 'markdown';

export interface NekoDurationUiState {
  readonly viewMode: DurationViewMode;
}

export interface DurationAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoDurationUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = ['PT1H30M', '90 min', '1d 2h', '3600', '1.5h'].join('\n');

export function DurationApp({ initialInput, initialUiState, clipboardDeps }: DurationAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<DurationViewMode>(initialUiState?.viewMode ?? 'table');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseDurationInput(input), [input]);

  const copyText =
    viewMode === 'json' ? parsed.json : viewMode === 'normalized' ? parsed.normalized : parsed.markdown;
  const copyDisabled = viewMode === 'table' ? parsed.count === 0 : copyText === '';

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
    <section className="tool tool--duration" aria-label="NekoDuration workbench">
      <section className="paste card">
        <label htmlFor="duration-paste" className="paste__label">
          Paste durations (ISO-8601, humanized, or seconds — one per line):
        </label>
        <textarea
          id="duration-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={6}
          data-testid="duration-input"
        />
        <p className="paste__hint">
          Converted entirely in your browser. Years/months use average lengths (365.25 d / 30.44 d).
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Duration output mode">
            <legend className="visually-hidden">Duration output mode</legend>
            {(['table', 'json', 'normalized', 'markdown'] as const).map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="durationViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {m === 'table' ? 'Table' : m === 'json' ? 'JSON' : m === 'normalized' ? 'ISO list' : 'Markdown'}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyDisabled}
              data-testid="duration-copy-output"
            >
              {viewMode === 'json' ? 'Copy JSON' : viewMode === 'normalized' ? 'Copy ISO list' : 'Copy markdown summary'}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="duration-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok ? `Copied to clipboard (via ${copyStatus.method}).` : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="duration-stats">
          <li>
            entries: <strong data-testid="duration-stat-count">{parsed.count}</strong>
          </li>
        </ul>

        {parsed.count > 0 ? (
          viewMode === 'table' ? (
            <table className="url-params" data-testid="duration-table">
              <thead>
                <tr>
                  <th scope="col">input</th>
                  <th scope="col">total seconds</th>
                  <th scope="col">ISO-8601</th>
                  <th scope="col">human</th>
                </tr>
              </thead>
              <tbody>
                {parsed.entries.map((e, i) => (
                  <tr key={`${e.input}-${i}`} data-valid={e.valid}>
                    <td>{e.input}</td>
                    <td data-testid={`duration-seconds-${i}`}>{e.value?.totalSeconds ?? '—'}</td>
                    <td data-testid={`duration-iso-${i}`}>{e.value?.iso ?? '(invalid)'}</td>
                    <td>{e.value?.human ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre className="toml-output" data-testid="duration-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json' ? parsed.json : viewMode === 'normalized' ? parsed.normalized : parsed.markdown}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="duration-no-document">
            No durations yet. Paste one above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
