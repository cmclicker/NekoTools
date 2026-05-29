import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseSemverInput } from './semver-parse.js';

/**
 * NekoSemver sub-app. Wires `@nekotools/lens-semver` into the shared
 * web-suite shell as a Utility tool tab. Free surface: paste versions (one
 * per line), optionally enter a range to test, and see components, the
 * ascending sort, and per-version satisfies — plus JSON / sorted / markdown
 * copy. All local; no registry lookups.
 */

export type SemverViewMode = 'table' | 'json' | 'sorted' | 'markdown';

export interface NekoSemverUiState {
  readonly range: string;
  readonly viewMode: SemverViewMode;
}

export interface SemverAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoSemverUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = ['1.2.0', '1.10.0', '1.2.0-rc.1', '2.0.0-beta', '0.9.9'].join('\n');

export function SemverApp({ initialInput, initialUiState, clipboardDeps }: SemverAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [range, setRange] = useState<string>(initialUiState?.range ?? '^1.2.0');
  const [viewMode, setViewMode] = useState<SemverViewMode>(initialUiState?.viewMode ?? 'table');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseSemverInput(input, range), [input, range]);
  const hasRange = parsed.range !== null;

  const copyText =
    viewMode === 'json' ? parsed.json : viewMode === 'sorted' ? parsed.sorted : parsed.markdown;

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [copyText, clipboardDeps]);

  return (
    <section className="tool tool--semver" aria-label="NekoSemver workbench">
      <section className="paste card">
        <label htmlFor="semver-paste" className="paste__label">
          Paste semantic versions (one per line):
        </label>
        <textarea
          id="semver-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={6}
          data-testid="semver-input"
        />
        <div className="results__toolbar">
          <label className="cookies-mask" htmlFor="semver-range">
            Range:
            <input
              id="semver-range"
              type="text"
              className="semver-range-input"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              placeholder="e.g. ^1.2.0 || ~2.0.0"
              spellCheck={false}
              data-testid="semver-range"
            />
          </label>
        </div>
        <p className="paste__hint">
          Comparison and range matching run entirely in your browser. No npm/registry lookups.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Semver output mode">
            <legend className="visually-hidden">Semver output mode</legend>
            {(['table', 'json', 'sorted', 'markdown'] as const).map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="semverViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {m === 'table' ? 'Table' : m === 'json' ? 'JSON' : m === 'sorted' ? 'Sorted' : 'Markdown'}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyText === ''}
              data-testid="semver-copy-output"
            >
              {viewMode === 'json' ? 'Copy JSON' : viewMode === 'sorted' ? 'Copy sorted' : 'Copy markdown summary'}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="semver-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="semver-stats">
          <li>
            versions: <strong data-testid="semver-stat-count">{parsed.count}</strong>
          </li>
          {hasRange ? (
            <li>
              range: <strong>{parsed.range}</strong>
            </li>
          ) : null}
        </ul>

        {parsed.count > 0 ? (
          viewMode === 'table' ? (
            <table className="url-params" data-testid="semver-table">
              <thead>
                <tr>
                  <th scope="col">input</th>
                  <th scope="col">valid</th>
                  <th scope="col">normalized</th>
                  <th scope="col">prerelease</th>
                  {hasRange ? <th scope="col">satisfies</th> : null}
                </tr>
              </thead>
              <tbody>
                {parsed.versions.map((v, i) => (
                  <tr key={`${v.input}-${i}`} data-valid={v.valid}>
                    <td>{v.input}</td>
                    <td>{v.valid ? 'yes' : 'no'}</td>
                    <td>{v.version ?? '—'}</td>
                    <td>{v.components?.prerelease ?? '—'}</td>
                    {hasRange ? (
                      <td data-testid={`semver-satisfies-${i}`}>
                        {v.satisfies === null ? '—' : v.satisfies ? 'yes' : 'no'}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre className="toml-output" data-testid="semver-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json' ? parsed.json : viewMode === 'sorted' ? parsed.sorted : parsed.markdown}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="semver-no-document">
            No versions yet. Paste a semantic version above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
