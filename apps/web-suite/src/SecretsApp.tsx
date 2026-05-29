import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { scanSecrets } from './secrets-parse.js';

/**
 * NekoSecrets sub-app. Wires `@nekotools/lens-secrets` into the shared
 * web-suite shell as the SECURITY tool tab. Free surface: paste config /
 * logs / code, see flagged credentials (provider patterns + entropy) with
 * masked previews + line:col + severity, and copy a JSON / CSV / markdown
 * report. Everything runs locally — the cleartext secret only ever lives
 * in your input box; findings store masked previews only and nothing is
 * ever uploaded.
 */

export type SecretsViewMode = 'findings' | 'json' | 'csv' | 'markdown';

export interface NekoSecretsUiState {
  readonly viewMode: SecretsViewMode;
}

export interface SecretsAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoSecretsUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = [
  '# paste config, logs, or code — nothing leaves your machine',
  'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
  'github_token: ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'DB_PASSWORD = "hunter2hunter2"',
  'note: this line is fine and will not be flagged',
].join('\n');

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function copyLabel(mode: SecretsViewMode): string {
  if (mode === 'json') return 'Copy JSON';
  if (mode === 'csv') return 'Copy CSV';
  return 'Copy markdown summary';
}

export function SecretsApp({
  initialInput,
  initialUiState,
  clipboardDeps,
}: SecretsAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<SecretsViewMode>(initialUiState?.viewMode ?? 'findings');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const result = useMemo(() => scanSecrets(input), [input]);

  const copyText =
    viewMode === 'json' ? result.json : viewMode === 'csv' ? result.csv : result.markdown;

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [copyText, clipboardDeps]);

  const sortedFindings = useMemo(
    () =>
      [...result.findings].sort(
        (a, b) =>
          (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
          a.line - b.line ||
          a.column - b.column,
      ),
    [result.findings],
  );

  return (
    <section className="tool tool--secrets" aria-label="NekoSecrets workbench">
      <section className="paste card">
        <label htmlFor="secrets-paste" className="paste__label">
          Paste text to scan for leaked credentials:
        </label>
        <textarea
          id="secrets-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={10}
          data-testid="secrets-input"
        />
        <p className="paste__hint">
          Scanning runs entirely in your browser. The cleartext only lives in this box — findings
          store masked previews only, and nothing is ever uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Secrets output mode">
            <legend className="visually-hidden">Secrets output mode</legend>
            {(['findings', 'json', 'csv', 'markdown'] as const).map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="secretsViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {m === 'findings' ? 'Findings' : m === 'json' ? 'JSON' : m === 'csv' ? 'CSV' : 'Markdown'}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={viewMode === 'findings' ? result.findingCount === 0 : copyText === ''}
              data-testid="secrets-copy-output"
            >
              {viewMode === 'findings' ? 'Copy markdown summary' : copyLabel(viewMode)}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="secrets-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="secrets-stats">
          <li>
            findings: <strong data-testid="secrets-stat-count">{result.findingCount}</strong>
          </li>
        </ul>

        {result.findingCount > 0 ? (
          viewMode === 'findings' ? (
            <table className="url-params" data-testid="secrets-table">
              <thead>
                <tr>
                  <th scope="col">severity</th>
                  <th scope="col">rule</th>
                  <th scope="col">line:col</th>
                  <th scope="col">preview (masked)</th>
                </tr>
              </thead>
              <tbody>
                {sortedFindings.map((f, i) => (
                  <tr key={`${f.ruleId}-${f.line}-${f.column}-${i}`} data-severity={f.severity}>
                    <td data-testid={`secrets-sev-${i}`}>{f.severity}</td>
                    <td>{f.ruleId}</td>
                    <td>
                      {f.line}:{f.column}
                    </td>
                    <td data-testid={`secrets-preview-${i}`}>{f.preview}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre className="toml-output" data-testid="secrets-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json' ? result.json : viewMode === 'csv' ? result.csv : result.markdown}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="secrets-clean">
            No secrets detected. Paste config, logs, or code above to scan.
          </div>
        )}

        <Diagnostics diagnostics={result.diagnostics} />
      </section>
    </section>
  );
}
