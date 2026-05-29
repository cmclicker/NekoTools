import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { runPackage } from './package-parse.js';

export interface NekoPackageUiState {
  readonly showDependencies: boolean;
  readonly showScripts: boolean;
}

export interface PackageAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoPackageUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

type CopyTarget = 'json' | 'markdown';

interface CopyStatus {
  readonly ok: boolean;
  readonly target: CopyTarget;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = `{
  "name": "@acme/example",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.12.1",
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run",
    "postinstall": "node ./scripts/setup.js"
  },
  "dependencies": {
    "react": "^18.3.1"
  },
  "devDependencies": {
    "typescript": "^6.0.3",
    "vitest": "^1.6.1"
  }
}`;

export function PackageApp({
  initialInput,
  initialUiState,
  clipboardDeps,
}: PackageAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [showDependencies, setShowDependencies] = useState<boolean>(
    initialUiState?.showDependencies ?? true,
  );
  const [showScripts, setShowScripts] = useState<boolean>(initialUiState?.showScripts ?? true);
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const run = useMemo(() => runPackage(input), [input]);
  const manifest = run.manifest;

  const handleCopy = useCallback(
    async (target: CopyTarget) => {
      const text = target === 'json' ? run.jsonSummary : run.markdownSummary;
      if (text === null) {
        setCopyStatus({ ok: false, target, method: 'none' });
        return;
      }
      const result = await copyToClipboard(text, clipboardDeps);
      setCopyStatus({ ok: result.ok, target, method: result.method });
    },
    [clipboardDeps, run.jsonSummary, run.markdownSummary],
  );

  return (
    <section className="tool tool--package" aria-label="NekoPackage workbench">
      <section className="paste card">
        <label htmlFor="package-paste" className="paste__label">
          Paste package.json:
        </label>
        <textarea
          id="package-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={14}
          data-testid="package-input"
        />
        <p className="paste__hint">
          Inspection runs locally in your browser. No registry lookups, installs, telemetry, or
          remote fetches.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Package sections">
            <legend className="visually-hidden">Package sections</legend>
            <label className={showDependencies ? 'viewmode--active' : ''}>
              <input
                type="checkbox"
                checked={showDependencies}
                onChange={(event) => setShowDependencies(event.currentTarget.checked)}
                data-testid="package-toggle-dependencies"
              />
              Dependencies
            </label>
            <label className={showScripts ? 'viewmode--active' : ''}>
              <input
                type="checkbox"
                checked={showScripts}
                onChange={(event) => setShowScripts(event.currentTarget.checked)}
                data-testid="package-toggle-scripts"
              />
              Scripts
            </label>
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={() => void handleCopy('json')}
              disabled={run.jsonSummary === null}
              data-testid="package-copy-json"
            >
              Copy JSON
            </button>
            <button
              type="button"
              className="copy__btn"
              onClick={() => void handleCopy('markdown')}
              disabled={run.markdownSummary === null}
              data-testid="package-copy-markdown"
            >
              Copy Markdown
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="package-copy-status"
              data-target={copyStatus.target}
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied ${copyStatus.target} summary to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy yet.'}
            </p>
          ) : null}
        </div>

        {manifest === null ? (
          <div role="status" className="empty-state" data-testid="package-no-manifest">
            No package manifest parsed. Check diagnostics below.
          </div>
        ) : (
          <>
            <dl className="kv package-metadata" data-testid="package-metadata">
              <dt>Name</dt>
              <dd>{manifest.name ?? '(missing)'}</dd>
              <dt>Version</dt>
              <dd>{manifest.version ?? '(missing)'}</dd>
              <dt>Private</dt>
              <dd>{manifest.private === null ? '(missing)' : String(manifest.private)}</dd>
              <dt>Package manager</dt>
              <dd>{manifest.packageManager ?? '(missing)'}</dd>
              <dt>Type</dt>
              <dd>{manifest.type ?? '(missing)'}</dd>
              <dt>License</dt>
              <dd>{manifest.license ?? '(missing)'}</dd>
              <dt>Input bytes</dt>
              <dd>{run.inputBytes}</dd>
            </dl>

            <dl className="package-counts" data-testid="package-counts">
              <dt>Total deps</dt>
              <dd>{manifest.dependencyCounts.total}</dd>
              <dt>Runtime</dt>
              <dd>{manifest.dependencyCounts.dependencies}</dd>
              <dt>Dev</dt>
              <dd>{manifest.dependencyCounts.devDependencies}</dd>
              <dt>Peer</dt>
              <dd>{manifest.dependencyCounts.peerDependencies}</dd>
              <dt>Optional</dt>
              <dd>{manifest.dependencyCounts.optionalDependencies}</dd>
              <dt>Scripts</dt>
              <dd>{manifest.scripts.length}</dd>
            </dl>

            {showDependencies ? (
              <section className="package-section" aria-label="Dependencies">
                <h2 className="package-section__heading">Dependencies</h2>
                {manifest.dependencies.length > 0 ? (
                  <div className="env-table package-table" data-testid="package-dependencies">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Range</th>
                          <th>Section</th>
                          <th>Flags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manifest.dependencies.map((dependency) => {
                          const flags = [
                            dependency.remote ? 'remote' : null,
                            dependency.unpinned ? 'unpinned' : null,
                          ].filter((flag): flag is string => flag !== null);
                          return (
                            <tr key={`${dependency.section}:${dependency.name}`}>
                              <td>
                                <code>{dependency.name}</code>
                              </td>
                              <td>
                                <code>{dependency.range}</code>
                              </td>
                              <td>{dependency.section}</td>
                              <td>{flags.length > 0 ? flags.join(', ') : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="package-empty" data-testid="package-no-dependencies">
                    No dependency sections found.
                  </p>
                )}
              </section>
            ) : null}

            {showScripts ? (
              <section className="package-section" aria-label="Scripts">
                <h2 className="package-section__heading">Scripts</h2>
                {manifest.scripts.length > 0 ? (
                  <div className="env-table package-table" data-testid="package-scripts">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Command</th>
                          <th>Flags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manifest.scripts.map((script) => (
                          <tr key={script.name}>
                            <td>
                              <code>{script.name}</code>
                            </td>
                            <td>
                              <code>{script.command}</code>
                            </td>
                            <td>
                              {script.riskFlags.length > 0 ? script.riskFlags.join(', ') : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="package-empty" data-testid="package-no-scripts">
                    No scripts found.
                  </p>
                )}
              </section>
            ) : null}
          </>
        )}

        <Diagnostics diagnostics={run.diagnostics} />
      </section>
    </section>
  );
}
