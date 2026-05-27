import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseHeadersText } from './headers-parse.js';
import type { HeaderEntry } from '@nekotools/lens-headers';

/**
 * NekoHeaders sub-app — Wave 3 UI. Wires `@nekotools/lens-headers` into
 * the shared web-suite shell as the fifth tool tab. Paste an HTTP header
 * block, see the parsed Name/Value table or the JSON projection, see
 * diagnostics (malformed lines, duplicate headers, basic security hints),
 * and copy the JSON. The shared `ProSurface` renders via the registry.
 */

export type HeadersViewMode = 'table' | 'json';

export interface NekoHeadersUiState {
  readonly viewMode: HeadersViewMode;
}

export interface HeadersAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoHeadersUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = `HTTP/1.1 200 OK
content-type: application/json
cache-control: no-store
server: nekotools`;

export function HeadersApp({
  initialInput,
  initialUiState,
  clipboardDeps,
}: HeadersAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<HeadersViewMode>(initialUiState?.viewMode ?? 'table');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseHeadersText(input), [input]);
  const entries = parsed.document?.entries ?? [];
  const hasHeaders = entries.length > 0;

  const handleCopy = useCallback(async () => {
    if (parsed.jsonOutput === null) {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const result = await copyToClipboard(parsed.jsonOutput, clipboardDeps);
    setCopyStatus({ ok: result.ok, method: result.method });
  }, [parsed.jsonOutput, clipboardDeps]);

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
          Parsing runs entirely in your browser. No requests, no network, no telemetry.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Headers view mode">
            <legend className="visually-hidden">Headers view mode</legend>
            <label className={viewMode === 'table' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="headersViewMode"
                value="table"
                checked={viewMode === 'table'}
                onChange={() => setViewMode('table')}
              />
              Table
            </label>
            <label className={viewMode === 'json' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="headersViewMode"
                value="json"
                checked={viewMode === 'json'}
                onChange={() => setViewMode('json')}
              />
              JSON
            </label>
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={!hasHeaders}
              data-testid="headers-copy-json"
            >
              Copy JSON
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
                : 'Copy failed: no headers to copy.'}
            </p>
          ) : null}
        </div>

        {hasHeaders ? (
          viewMode === 'table' ? (
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
            <pre className="yaml-output" data-testid="headers-output" aria-label="Headers as JSON">
              {parsed.jsonOutput}
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
