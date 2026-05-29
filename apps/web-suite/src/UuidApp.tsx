import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseUuidInput } from './uuid-parse.js';

/**
 * NekoUUID sub-app. Wires `@nekotools/lens-uuid` into the shared web-suite
 * shell as a Utility tool tab. Free surface: paste one or more UUIDs/ULIDs
 * (one per line), see kind / version / variant / embedded timestamp per id,
 * and copy a JSON / normalized / markdown report. All local — NekoUUID
 * inspects, it never generates.
 */

export type UuidViewMode = 'table' | 'json' | 'normalized' | 'markdown';

export interface NekoUuidUiState {
  readonly viewMode: UuidViewMode;
}

export interface UuidAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoUuidUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = [
  '550e8400-e29b-41d4-a716-446655440000',
  '017F22E2-79B0-7CC3-98C4-DC0C0C07398F',
  '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '00000000-0000-0000-0000-000000000000',
].join('\n');

function tagOf(id: { isNil: boolean; isMax: boolean; version: number | null }): string {
  if (id.isNil) return 'nil';
  if (id.isMax) return 'max';
  return id.version !== null ? `v${id.version}` : '—';
}

export function UuidApp({ initialInput, initialUiState, clipboardDeps }: UuidAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<UuidViewMode>(initialUiState?.viewMode ?? 'table');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseUuidInput(input), [input]);

  const copyText =
    viewMode === 'json'
      ? parsed.json
      : viewMode === 'normalized'
        ? parsed.normalized
        : parsed.markdown;

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [copyText, clipboardDeps]);

  return (
    <section className="tool tool--uuid" aria-label="NekoUUID workbench">
      <section className="paste card">
        <label htmlFor="uuid-paste" className="paste__label">
          Paste UUIDs / ULIDs (one per line):
        </label>
        <textarea
          id="uuid-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={6}
          data-testid="uuid-input"
        />
        <p className="paste__hint">
          Inspection runs entirely in your browser — version, variant, and embedded timestamps
          (UTC). Nothing is generated or uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="UUID output mode">
            <legend className="visually-hidden">UUID output mode</legend>
            {(['table', 'json', 'normalized', 'markdown'] as const).map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="uuidViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {m === 'table' ? 'Table' : m === 'json' ? 'JSON' : m === 'normalized' ? 'Normalized' : 'Markdown'}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyText === ''}
              data-testid="uuid-copy-output"
            >
              {viewMode === 'json' ? 'Copy JSON' : viewMode === 'normalized' ? 'Copy normalized' : 'Copy markdown summary'}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="uuid-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="uuid-stats">
          <li>
            identifiers: <strong data-testid="uuid-stat-count">{parsed.count}</strong>
          </li>
        </ul>

        {parsed.count > 0 ? (
          viewMode === 'table' ? (
            <table className="url-params" data-testid="uuid-table">
              <thead>
                <tr>
                  <th scope="col">input</th>
                  <th scope="col">kind</th>
                  <th scope="col">version</th>
                  <th scope="col">variant</th>
                  <th scope="col">timestamp (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {parsed.ids.map((id, i) => (
                  <tr key={`${id.input}-${i}`} data-valid={id.valid}>
                    <td>{id.input}</td>
                    <td data-testid={`uuid-kind-${i}`}>{id.kind}</td>
                    <td data-testid={`uuid-version-${i}`}>{tagOf(id)}</td>
                    <td>{id.variant ?? '—'}</td>
                    <td data-testid={`uuid-ts-${i}`}>{id.timestamp ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre className="toml-output" data-testid="uuid-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json' ? parsed.json : viewMode === 'normalized' ? parsed.normalized : parsed.markdown}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="uuid-no-document">
            No identifiers yet. Paste a UUID or ULID above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
