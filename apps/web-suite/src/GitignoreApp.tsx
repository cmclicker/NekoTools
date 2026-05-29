import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseGitignoreInput } from './gitignore-parse.js';

/**
 * NekoGitignore sub-app. Wires `@nekotools/lens-gitignore` into the shared
 * web-suite shell as a Project tool tab. Free surface: paste a .gitignore,
 * see each rule classified, test paths against the ruleset (ignored / not,
 * which rule decided), and copy JSON / normalized / markdown. All local.
 */

export type GitignoreViewMode = 'rules' | 'paths' | 'json' | 'normalized' | 'markdown';

export interface NekoGitignoreUiState {
  readonly paths: string;
  readonly viewMode: GitignoreViewMode;
}

export interface GitignoreAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoGitignoreUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = [
  '# dependencies',
  'node_modules/',
  '',
  '# build output',
  'dist/',
  '*.log',
  '!important.log',
  '/.env',
].join('\n');

const SAMPLE_PATHS = ['node_modules/react/index.js', 'dist/app.js', 'debug.log', 'important.log', '.env'].join('\n');

export function GitignoreApp({ initialInput, initialUiState, clipboardDeps }: GitignoreAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [paths, setPaths] = useState<string>(initialUiState?.paths ?? SAMPLE_PATHS);
  const [viewMode, setViewMode] = useState<GitignoreViewMode>(initialUiState?.viewMode ?? 'rules');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseGitignoreInput(input, paths), [input, paths]);

  const copyText =
    viewMode === 'json' ? parsed.json : viewMode === 'normalized' ? parsed.normalized : parsed.markdown;
  const copyDisabled = viewMode === 'rules' || viewMode === 'paths' ? parsed.patternCount === 0 : copyText === '';

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
    <section className="tool tool--gitignore" aria-label="NekoGitignore workbench">
      <section className="paste card">
        <label htmlFor="gitignore-paste" className="paste__label">
          Paste a .gitignore:
        </label>
        <textarea
          id="gitignore-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={8}
          data-testid="gitignore-input"
        />
        <label htmlFor="gitignore-paths" className="paste__label">
          Test paths (one per line) — optional:
        </label>
        <textarea
          id="gitignore-paths"
          className="paste__textarea"
          value={paths}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setPaths(e.target.value)}
          spellCheck={false}
          rows={4}
          data-testid="gitignore-paths"
        />
        <p className="paste__hint">
          Classification + path matching run entirely in your browser. No repo, no filesystem, no
          network.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Gitignore output mode">
            <legend className="visually-hidden">Gitignore output mode</legend>
            {(['rules', 'paths', 'json', 'normalized', 'markdown'] as const).map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="gitignoreViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {m === 'rules' ? 'Rules' : m === 'paths' ? 'Path tests' : m === 'json' ? 'JSON' : m === 'normalized' ? 'Normalized' : 'Markdown'}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyDisabled}
              data-testid="gitignore-copy-output"
            >
              {viewMode === 'json' ? 'Copy JSON' : viewMode === 'normalized' ? 'Copy normalized' : 'Copy markdown summary'}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="gitignore-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok ? `Copied to clipboard (via ${copyStatus.method}).` : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="gitignore-stats">
          <li>
            patterns: <strong data-testid="gitignore-stat-patterns">{parsed.patternCount}</strong>
          </li>
          <li>
            comments: <strong>{parsed.commentCount}</strong>
          </li>
        </ul>

        {parsed.patternCount > 0 ? (
          viewMode === 'rules' ? (
            <table className="url-params" data-testid="gitignore-rules">
              <thead>
                <tr>
                  <th scope="col">line</th>
                  <th scope="col">pattern</th>
                  <th scope="col">negated</th>
                  <th scope="col">dir-only</th>
                  <th scope="col">anchored</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rules
                  .filter((r) => r.pattern !== null)
                  .map((r) => (
                    <tr key={r.lineNo}>
                      <td>{r.lineNo}</td>
                      <td>{r.pattern}</td>
                      <td>{r.negated ? 'yes' : 'no'}</td>
                      <td>{r.dirOnly ? 'yes' : 'no'}</td>
                      <td>{r.anchored ? 'yes' : 'no'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : viewMode === 'paths' ? (
            parsed.paths.length > 0 ? (
              <table className="url-params" data-testid="gitignore-path-results">
                <thead>
                  <tr>
                    <th scope="col">path</th>
                    <th scope="col">ignored</th>
                    <th scope="col">by line</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.paths.map((p, i) => (
                    <tr key={`${p.path}-${i}`} data-ignored={p.ignored}>
                      <td>{p.path}</td>
                      <td data-testid={`gitignore-ignored-${i}`}>{p.ignored ? 'ignored' : 'tracked'}</td>
                      <td>{p.matchedBy ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-state" data-testid="gitignore-no-paths">
                Enter test paths above to see which are ignored.
              </p>
            )
          ) : (
            <pre className="toml-output" data-testid="gitignore-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json' ? parsed.json : viewMode === 'normalized' ? parsed.normalized : parsed.markdown}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="gitignore-no-document">
            No patterns yet. Paste a .gitignore above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
