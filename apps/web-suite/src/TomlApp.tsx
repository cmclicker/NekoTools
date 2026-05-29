import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseTomlInput } from './toml-parse.js';

/**
 * NekoTOML sub-app. Wires `@nekotools/lens-toml` into the shared web-suite
 * shell as another DATA tool tab. Free surface: paste TOML, see the
 * decoded value tree as JSON, convert/normalize it, read structural
 * diagnostics (duplicate keys, parse errors with line numbers, unsupported
 * multi-line constructs), and copy the JSON / normalized TOML / markdown
 * summary. The shared `ProSurface` (Free/Pro) renders via the tool
 * registry; this component is the panel only. Everything runs locally —
 * NekoTOML never fetches or resolves anything referenced in the document.
 */

export type TomlViewMode = 'json' | 'normalized' | 'markdown';

export interface NekoTomlUiState {
  readonly viewMode: TomlViewMode;
}

export interface TomlAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoTomlUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = [
  '# NekoTOML — paste a TOML document',
  'title = "NekoTOML demo"',
  'version = 1',
  '',
  '[server]',
  'host = "localhost"',
  'port = 8080',
  'tags = ["local", "offline"]',
  '',
  '[[product]]',
  'name = "hammer"',
  '',
  '[[product]]',
  'name = "nail"',
].join('\n');

function copyLabel(mode: TomlViewMode): string {
  if (mode === 'json') return 'Copy JSON';
  if (mode === 'normalized') return 'Copy normalized TOML';
  return 'Copy markdown summary';
}

export function TomlApp({
  initialInput,
  initialUiState,
  clipboardDeps,
}: TomlAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<TomlViewMode>(initialUiState?.viewMode ?? 'json');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseTomlInput(input), [input]);

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
    const result = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: result.ok, method: result.method });
  }, [copyText, clipboardDeps]);

  const output =
    viewMode === 'json' ? parsed.json : viewMode === 'normalized' ? parsed.normalized : parsed.markdown;

  return (
    <section className="tool tool--toml" aria-label="NekoTOML workbench">
      <section className="paste card">
        <label htmlFor="toml-paste" className="paste__label">
          Paste TOML here:
        </label>
        <textarea
          id="toml-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={10}
          data-testid="toml-input"
        />
        <p className="paste__hint">
          Parsing runs entirely in your browser. No network, no file resolution, no telemetry,
          nothing uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="TOML output mode">
            <legend className="visually-hidden">TOML output mode</legend>
            <label className={viewMode === 'json' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="tomlViewMode"
                value="json"
                checked={viewMode === 'json'}
                onChange={() => setViewMode('json')}
              />
              JSON
            </label>
            <label className={viewMode === 'normalized' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="tomlViewMode"
                value="normalized"
                checked={viewMode === 'normalized'}
                onChange={() => setViewMode('normalized')}
              />
              Normalized TOML
            </label>
            <label className={viewMode === 'markdown' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="tomlViewMode"
                value="markdown"
                checked={viewMode === 'markdown'}
                onChange={() => setViewMode('markdown')}
              />
              Markdown
            </label>
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyText === ''}
              data-testid="toml-copy-output"
            >
              {copyLabel(viewMode)}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="toml-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="toml-stats">
          <li>
            valid: <strong data-testid="toml-stat-valid">{parsed.valid ? 'yes' : 'no'}</strong>
          </li>
          <li>
            tables: <strong data-testid="toml-stat-tables">{parsed.tableCount}</strong>
          </li>
          <li>
            keys: <strong data-testid="toml-stat-keys">{parsed.keyCount}</strong>
          </li>
        </ul>

        {parsed.data !== null ? (
          <pre className="toml-output" data-testid="toml-output" aria-label={`${viewMode} output`}>
            {output}
          </pre>
        ) : (
          <div role="status" className="empty-state" data-testid="toml-no-document">
            No TOML decoded yet. Paste a document above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
