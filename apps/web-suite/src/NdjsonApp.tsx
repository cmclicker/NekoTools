import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseNdjsonInput } from './ndjson-parse.js';

/**
 * NekoNDJSON sub-app. Wires `@nekotools/lens-ndjson` into the shared
 * web-suite shell as a DATA tool tab. Free surface: paste NDJSON, see each
 * record (valid/invalid per line) and the inferred shape, convert to a JSON
 * array / normalized NDJSON, and copy. One bad line never sinks the rest.
 */

export type NdjsonViewMode = 'records' | 'shape' | 'json' | 'ndjson' | 'markdown';

export interface NekoNdjsonUiState {
  readonly viewMode: NdjsonViewMode;
}

export interface NdjsonAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoNdjsonUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = [
  '{"id": 1, "name": "alpha", "active": true}',
  '{"id": 2, "name": "beta"}',
  '{"id": 3, "name": "gamma", "active": false, "score": 9.5}',
].join('\n');

function previewValue(value: unknown): string {
  const s = JSON.stringify(value);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

export function NdjsonApp({ initialInput, initialUiState, clipboardDeps }: NdjsonAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<NdjsonViewMode>(initialUiState?.viewMode ?? 'records');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseNdjsonInput(input), [input]);

  const copyText =
    viewMode === 'json' ? parsed.json : viewMode === 'ndjson' ? parsed.ndjson : parsed.markdown;
  const copyDisabled = (viewMode === 'records' || viewMode === 'shape') ? parsed.count === 0 : copyText === '';

  const handleCopy = useCallback(async () => {
    const text = viewMode === 'json' ? parsed.json : viewMode === 'ndjson' ? parsed.ndjson : parsed.markdown;
    if (text === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(text, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [viewMode, parsed, clipboardDeps]);

  return (
    <section className="tool tool--ndjson" aria-label="NekoNDJSON workbench">
      <section className="paste card">
        <label htmlFor="ndjson-paste" className="paste__label">
          Paste NDJSON (one JSON value per line):
        </label>
        <textarea
          id="ndjson-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={8}
          data-testid="ndjson-input"
        />
        <p className="paste__hint">
          Parsing runs entirely in your browser. Each line is parsed independently — one bad line
          never sinks the rest. Nothing uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="NDJSON output mode">
            <legend className="visually-hidden">NDJSON output mode</legend>
            {(['records', 'shape', 'json', 'ndjson', 'markdown'] as const).map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="ndjsonViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {m === 'records' ? 'Records' : m === 'shape' ? 'Shape' : m === 'json' ? 'JSON array' : m === 'ndjson' ? 'NDJSON' : 'Markdown'}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyDisabled}
              data-testid="ndjson-copy-output"
            >
              {viewMode === 'json' ? 'Copy JSON array' : viewMode === 'ndjson' ? 'Copy NDJSON' : 'Copy markdown summary'}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="ndjson-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="ndjson-stats">
          <li>
            records: <strong data-testid="ndjson-stat-count">{parsed.count}</strong>
          </li>
          <li>
            valid: <strong data-testid="ndjson-stat-valid">{parsed.validCount}</strong>
          </li>
          <li>
            invalid: <strong data-testid="ndjson-stat-invalid">{parsed.invalidCount}</strong>
          </li>
        </ul>

        {parsed.count > 0 ? (
          viewMode === 'records' ? (
            <table className="url-params" data-testid="ndjson-records">
              <thead>
                <tr>
                  <th scope="col">line</th>
                  <th scope="col">valid</th>
                  <th scope="col">type</th>
                  <th scope="col">value / error</th>
                </tr>
              </thead>
              <tbody>
                {parsed.records.map((r) => (
                  <tr key={r.line} data-valid={r.valid}>
                    <td>{r.line}</td>
                    <td>{r.valid ? 'yes' : 'no'}</td>
                    <td>{r.type ?? '—'}</td>
                    <td>{r.valid ? previewValue(r.value) : r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : viewMode === 'shape' ? (
            parsed.fields.length > 0 ? (
              <table className="url-params" data-testid="ndjson-shape">
                <thead>
                  <tr>
                    <th scope="col">key</th>
                    <th scope="col">types</th>
                    <th scope="col">optional</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.fields.map((f) => (
                    <tr key={f.key}>
                      <td>{f.key}</td>
                      <td>{f.types.join(', ')}</td>
                      <td>{f.optional ? 'yes' : 'no'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-state" data-testid="ndjson-no-shape">
                No shape inferred — records are not all JSON objects.
              </p>
            )
          ) : (
            <pre className="toml-output" data-testid="ndjson-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json' ? parsed.json : viewMode === 'ndjson' ? parsed.ndjson : parsed.markdown}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="ndjson-no-document">
            No records yet. Paste NDJSON above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
