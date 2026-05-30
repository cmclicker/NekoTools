import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';
import type { HeaderEntry } from '@nekotools/lens-headers';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseHeadersText } from './headers-parse.js';

/**
 * NekoHeaders sub-app. Wires `@nekotools/lens-headers` into the shared
 * web-suite shell as a Web tool tab. Free: paste an HTTP header block, see the
 * Name/Value table or JSON projection, read diagnostics (malformed lines,
 * duplicate headers, basic security hints), copy. Pro (gated by the suite
 * license): a severity-ranked security audit + a hardened CORS/CSP header pack.
 * All local — no request is ever made to fetch headers from a URL.
 */

export type HeadersViewMode = 'table' | 'json' | 'markdown' | 'audit' | 'pack';

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

const PRO_VIEWS = new Set<HeadersViewMode>(['audit', 'pack']);
const VIEW_MODES: readonly HeadersViewMode[] = ['table', 'json', 'markdown', 'audit', 'pack'];
const VIEW_LABELS: Record<HeadersViewMode, string> = {
  table: 'Table',
  json: 'JSON',
  markdown: 'Markdown',
  audit: 'Audit ⭐',
  pack: 'CORS/CSP pack ⭐',
};
const COPY_LABELS: Record<HeadersViewMode, string> = {
  table: 'Copy JSON',
  json: 'Copy JSON',
  markdown: 'Copy markdown summary',
  audit: 'Copy audit',
  pack: 'Copy pack',
};

const SAMPLE_INPUT = `HTTP/1.1 200 OK
content-type: application/json
cache-control: no-store
server: nekotools`;

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

  const outputText =
    viewMode === 'json'
      ? parsed.jsonOutput
      : viewMode === 'markdown'
        ? parsed.markdown
        : viewMode === 'audit'
          ? parsed.auditReport
          : viewMode === 'pack'
            ? parsed.corsCspPack
            : null; // table
  // Copy target: table + json copy the JSON; the rest copy their own output.
  const copyText =
    viewMode === 'table' ? (parsed.jsonOutput ?? '') : (outputText ?? '');

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
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
          Parsing and auditing run entirely in your browser. No request is made to fetch headers
          from a URL.
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
              disabled={copyText === ''}
              data-testid="headers-copy-output"
            >
              {COPY_LABELS[viewMode]}
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
              <strong>{viewMode === 'audit' ? 'Security audit' : 'CORS/CSP pack'} is a Pro feature.</strong>
              <p>
                Get a severity-ranked security-posture audit of these headers (with an A/B/C/F
                grade), and generate a hardened CORS + CSP header pack (HSTS, CSP, X-Frame-Options,
                Referrer-Policy, Permissions-Policy) to paste into your server config. Unlock with a
                license key (verified locally, works offline forever).
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
