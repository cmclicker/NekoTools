import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { scanSecrets } from './secrets-parse.js';

/**
 * NekoSecrets sub-app. Free surface: scan pasted text for leaked
 * credentials (provider patterns + entropy), masked previews, JSON/CSV/MD
 * export — all local. Pro surface (gated by a license entitlement): SARIF
 * export for CI and a redacted copy of the source. The cleartext secret
 * only ever lives in your input box.
 */

export type SecretsViewMode = 'findings' | 'json' | 'csv' | 'markdown' | 'sarif' | 'redacted';

export interface NekoSecretsUiState {
  readonly viewMode: SecretsViewMode;
  /** Local Pro unlock (dev/demo). A real build verifies a signed license key. */
  readonly proUnlocked: boolean;
}

export interface SecretsAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoSecretsUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to free unless the dev toggle unlocks it. */
  readonly entitlement?: Entitlement;
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

/** Local dev/demo entitlement (a real build derives this from a signed key). */
const DEV_PRO: Entitlement = {
  version: 1,
  licenseId: 'dev',
  licensee: 'Local Dev Unlock',
  tier: 'pro',
  features: ['*'],
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  signature: 'dev',
};

const PRO_VIEWS = new Set<SecretsViewMode>(['sarif', 'redacted']);

export function SecretsApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: SecretsAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<SecretsViewMode>(initialUiState?.viewMode ?? 'findings');
  const [devUnlock, setDevUnlock] = useState<boolean>(initialUiState?.proUnlocked ?? false);
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  // The suite-wide license (set via the header) is the real unlock; the
  // explicit `entitlement` prop overrides it (tests/embeds), and the dev
  // toggle is a local stand-in shown only when neither already grants Pro.
  const license = useLicenseContext();
  const effectiveEntitlement =
    entitlement ?? (devUnlock ? DEV_PRO : license.entitlement);
  const showDevToggle = entitlement === undefined && !license.isPro;
  const result = useMemo(() => scanSecrets(input, effectiveEntitlement), [input, effectiveEntitlement]);
  const proUnlocked = result.proUnlocked;

  const proOutput = viewMode === 'sarif' ? result.sarif : viewMode === 'redacted' ? result.redacted : null;
  const copyText =
    viewMode === 'json'
      ? result.json
      : viewMode === 'csv'
        ? result.csv
        : viewMode === 'sarif' || viewMode === 'redacted'
          ? (proOutput ?? '')
          : result.markdown;

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

  const copyDisabled =
    viewMode === 'findings'
      ? result.findingCount === 0
      : PRO_VIEWS.has(viewMode)
        ? !proUnlocked || copyText === ''
        : copyText === '';

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
        {showDevToggle ? (
          <label className="cookies-mask">
            <input
              type="checkbox"
              checked={devUnlock}
              onChange={(e) => setDevUnlock(e.target.checked)}
              data-testid="secrets-pro-toggle"
            />
            Unlock Pro (dev) — {proUnlocked ? `Licensed to ${DEV_PRO.licensee}` : 'SARIF + redacted export'}
          </label>
        ) : null}
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Secrets output mode">
            <legend className="visually-hidden">Secrets output mode</legend>
            {(['findings', 'json', 'csv', 'markdown', 'sarif', 'redacted'] as const).map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="secretsViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {m === 'findings'
                  ? 'Findings'
                  : m === 'json'
                    ? 'JSON'
                    : m === 'csv'
                      ? 'CSV'
                      : m === 'markdown'
                        ? 'Markdown'
                        : m === 'sarif'
                          ? 'SARIF ⭐'
                          : 'Redacted ⭐'}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyDisabled}
              data-testid="secrets-copy-output"
            >
              {viewMode === 'findings'
                ? 'Copy markdown summary'
                : viewMode === 'json'
                  ? 'Copy JSON'
                  : viewMode === 'csv'
                    ? 'Copy CSV'
                    : viewMode === 'sarif'
                      ? 'Copy SARIF'
                      : viewMode === 'redacted'
                        ? 'Copy redacted'
                        : 'Copy markdown summary'}
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

        {PRO_VIEWS.has(viewMode) && !proUnlocked ? (
          <div className="pro-lock" role="status" data-testid="secrets-locked">
            <strong>{viewMode === 'sarif' ? 'SARIF export' : 'Redacted source'} is a Pro feature.</strong>
            <p>
              {viewMode === 'sarif'
                ? 'Export findings as SARIF 2.1.0 to wire NekoSecrets into CI code-scanning.'
                : 'Get a copy of your input with every detected secret replaced by [REDACTED:rule] — safe to share.'}{' '}
              Unlock with a license key (verified locally, works offline forever).
            </p>
          </div>
        ) : result.findingCount > 0 ? (
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
              {viewMode === 'json'
                ? result.json
                : viewMode === 'csv'
                  ? result.csv
                  : viewMode === 'sarif'
                    ? (result.sarif ?? '')
                    : viewMode === 'redacted'
                      ? (result.redacted ?? '')
                      : result.markdown}
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
