import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseHeadersText } from './headers-parse.js';
import type { HeaderEntry } from '@nekotools/lens-headers';

/**
 * NekoHeaders sub-app — Web tool tab. Paste an HTTP header block, see the
 * parsed Name/Value table or the JSON projection, see diagnostics (malformed
 * lines, duplicate headers, basic security hints), and copy. Pro (gated by
 * the suite license): a deep security-posture audit + SARIF export for CI.
 * Parsing and auditing run entirely in the browser — no requests, ever.
 */

export type HeadersViewMode = 'table' | 'json' | 'audit' | 'sarif';

export interface NekoHeadersUiState {
  readonly viewMode: HeadersViewMode;
}

export interface HeadersAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoHeadersUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = `HTTP/1.1 200 OK
content-type: application/json
cache-control: no-store
server: nekotools`;

const PRO_VIEWS = new Set<HeadersViewMode>(['audit', 'sarif']);
const VIEW_MODES: readonly HeadersViewMode[] = ['table', 'json', 'audit', 'sarif'];
const VIEW_LABELS: Record<HeadersViewMode, string> = {
  table: 'Table',
  json: 'JSON',
  audit: 'Audit ⭐',
  sarif: 'SARIF ⭐',
};

export function HeadersApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: HeadersAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<HeadersViewMode>(initialUiState?.viewMode ?? 'table');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseHeadersText(input, effectiveEntitlement),
    [input, effectiveEntitlement],
  );
  const entries = parsed.document?.entries ?? [];
  const hasHeaders = entries.length > 0;
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);

  // Text shown in the <pre> for non-table views.
  const outputText =
    viewMode === 'json'
      ? parsed.jsonOutput
      : viewMode === 'audit'
        ? parsed.auditReport
        : viewMode === 'sarif'
          ? parsed.sarif
          : null;
  // Copy target: Pro views copy their own output; table + JSON both copy JSON.
  const copyText =
    viewMode === 'audit' ? parsed.auditReport : viewMode === 'sarif' ? parsed.sarif : parsed.jsonOutput;
  const copyLabel = viewMode === 'audit' ? 'Audit' : viewMode === 'sarif' ? 'SARIF' : 'JSON';

  const handleCopy = useCallback(async () => {
    if (copyText === null || copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const result = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: result.ok, method: result.method });
  }, [copyText, clipboardDeps]);

  return (
    <section className="tool tool--headers" aria-label="NekoHeaders workbench">
      <section className="paste card">
        <label htmlFor="headers-paste" className="paste__label">
          Paste HTTP headers here:
        </label>
        <textarea
          id="headers-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={8}
          data-testid="headers-input"
        />
        <p className="paste__hint">
          Parsing and auditing run entirely in your browser. No requests, no network, no telemetry.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Headers view mode">
            <legend className="visually-hidden">Headers view mode</legend>
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="headersViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {VIEW_LABELS[m]}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyText === null || copyText === ''}
              data-testid="headers-copy-json"
            >
              Copy {copyLabel}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="headers-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        {hasHeaders ? (
          isProView && !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="headers-locked">
              <strong>{viewMode === 'audit' ? 'Security audit' : 'SARIF export'} is a Pro feature.</strong>
              <p>
                Audit the response for missing hardening headers, weak values, permissive CORS, and
                info-leak headers — and export SARIF 2.1.0 to wire NekoHeaders into CI code-scanning.
                Unlock with a license key (verified locally, works offline forever).
              </p>
            </div>
          ) : viewMode === 'table' ? (
            <div className="env-table" data-testid="headers-table">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry: HeaderEntry, i: number) => (
                    <tr key={`${entry.name}-${i}`}>
                      <td>
                        <code>{entry.name}</code>
                      </td>
                      <td>{entry.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <pre className="yaml-output" data-testid="headers-output" aria-label={`${viewMode} output`}>
              {outputText}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="headers-no-document">
            No headers yet. Paste an HTTP header block above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
