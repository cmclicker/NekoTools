import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseMimeInput } from './mime-parse.js';

/**
 * NekoMIME sub-app. Wires `@nekotools/lens-mime` into the shared web-suite
 * shell as a Web tool tab. Free surface: paste Content-Type strings / MIME
 * types / file extensions (one per line), see essence, suffix, registration
 * tree, parameters, and known extensions, and copy JSON / normalized /
 * markdown. All local.
 */

export type MimeViewMode = 'table' | 'json' | 'normalized' | 'markdown';

export interface NekoMimeUiState {
  readonly viewMode: MimeViewMode;
}

export interface MimeAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoMimeUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = [
  'text/html; charset=UTF-8',
  'image/svg+xml',
  'multipart/form-data; boundary="--abc"',
  'application/vnd.ms-excel',
  'report.pdf',
].join('\n');

export function MimeApp({ initialInput, initialUiState, clipboardDeps }: MimeAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<MimeViewMode>(initialUiState?.viewMode ?? 'table');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseMimeInput(input), [input]);

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
    <section className="tool tool--mime" aria-label="NekoMIME workbench">
      <section className="paste card">
        <label htmlFor="mime-paste" className="paste__label">
          Paste Content-Type strings, MIME types, or file extensions (one per line):
        </label>
        <textarea
          id="mime-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={6}
          data-testid="mime-input"
        />
        <p className="paste__hint">
          Parsed entirely in your browser — no content sniffing, no network. Extension lookups use a
          common built-in table.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="MIME output mode">
            <legend className="visually-hidden">MIME output mode</legend>
            {(['table', 'json', 'normalized', 'markdown'] as const).map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="mimeViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {m === 'table' ? 'Table' : m === 'json' ? 'JSON' : m === 'normalized' ? 'Essence list' : 'Markdown'}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyDisabled}
              data-testid="mime-copy-output"
            >
              {viewMode === 'json' ? 'Copy JSON' : viewMode === 'normalized' ? 'Copy essence list' : 'Copy markdown summary'}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="mime-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok ? `Copied to clipboard (via ${copyStatus.method}).` : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="mime-stats">
          <li>
            entries: <strong data-testid="mime-stat-count">{parsed.count}</strong>
          </li>
        </ul>

        {parsed.count > 0 ? (
          viewMode === 'table' ? (
            <table className="url-params" data-testid="mime-table">
              <thead>
                <tr>
                  <th scope="col">input</th>
                  <th scope="col">essence</th>
                  <th scope="col">tree</th>
                  <th scope="col">suffix</th>
                  <th scope="col">params</th>
                  <th scope="col">extensions</th>
                </tr>
              </thead>
              <tbody>
                {parsed.entries.map((e, i) => (
                  <tr key={`${e.input}-${i}`} data-valid={e.valid}>
                    <td>{e.input}</td>
                    <td data-testid={`mime-essence-${i}`}>{e.value?.essence ?? '(invalid)'}</td>
                    <td>{e.value?.tree ?? '—'}</td>
                    <td>{e.value?.suffix ?? '—'}</td>
                    <td>
                      {e.value && e.value.parameters.length > 0
                        ? e.value.parameters.map((p) => `${p.name}=${p.value}`).join('; ')
                        : '—'}
                    </td>
                    <td>{e.value && e.value.extensions.length > 0 ? e.value.extensions.join(', ') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre className="toml-output" data-testid="mime-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json' ? parsed.json : viewMode === 'normalized' ? parsed.normalized : parsed.markdown}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="mime-no-document">
            No entries yet. Paste a Content-Type or extension above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
