import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseColorInput } from './color-parse.js';

/**
 * NekoColor sub-app. Wires `@nekotools/lens-color` into the shared
 * web-suite shell as a Utility tool tab. Free surface: paste colors (one
 * per line) in hex / rgb() / hsl() / CSS names, see a swatch + normalized
 * forms + WCAG contrast vs white/black, and copy JSON / hex list / markdown.
 * All local.
 */

export type ColorViewMode = 'swatches' | 'json' | 'normalized' | 'markdown';

export interface NekoColorUiState {
  readonly viewMode: ColorViewMode;
}

export interface ColorAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoColorUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = ['#3366ff', 'rgb(255, 99, 71)', 'hsl(120, 60%, 40%)', 'teal', '#1118'].join('\n');

export function ColorApp({ initialInput, initialUiState, clipboardDeps }: ColorAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<ColorViewMode>(initialUiState?.viewMode ?? 'swatches');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseColorInput(input), [input]);

  const copyText =
    viewMode === 'json' ? parsed.json : viewMode === 'normalized' ? parsed.normalized : parsed.markdown;
  const copyDisabled = viewMode === 'swatches' ? parsed.count === 0 : copyText === '';

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
    <section className="tool tool--color" aria-label="NekoColor workbench">
      <section className="paste card">
        <label htmlFor="color-paste" className="paste__label">
          Paste colors (one per line):
        </label>
        <textarea
          id="color-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={6}
          data-testid="color-input"
        />
        <p className="paste__hint">
          hex / rgb() / hsl() / CSS names are converted entirely in your browser. Nothing uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Color output mode">
            <legend className="visually-hidden">Color output mode</legend>
            {(['swatches', 'json', 'normalized', 'markdown'] as const).map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="colorViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {m === 'swatches' ? 'Swatches' : m === 'json' ? 'JSON' : m === 'normalized' ? 'Hex list' : 'Markdown'}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyDisabled}
              data-testid="color-copy-output"
            >
              {viewMode === 'json' ? 'Copy JSON' : viewMode === 'normalized' ? 'Copy hex list' : 'Copy markdown summary'}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="color-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok ? `Copied to clipboard (via ${copyStatus.method}).` : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="color-stats">
          <li>
            colors: <strong data-testid="color-stat-count">{parsed.count}</strong>
          </li>
        </ul>

        {parsed.count > 0 ? (
          viewMode === 'swatches' ? (
            <ul className="color-swatches" data-testid="color-swatches">
              {parsed.colors.map((c, i) => (
                <li className="color-swatch" key={`${c.input}-${i}`} data-valid={c.valid}>
                  <span
                    className="color-swatch__chip"
                    style={{ background: c.valid ? c.hex! : 'transparent' }}
                    data-testid={`color-chip-${i}`}
                    aria-hidden="true"
                  />
                  <div className="color-swatch__detail">
                    {c.valid ? (
                      <>
                        <code data-testid={`color-hex-${i}`}>{c.hex}</code>
                        <span className="color-swatch__forms">
                          {c.rgb} · {c.hsl}
                        </span>
                        <span className="color-swatch__contrast">
                          contrast — white {c.contrastWhite}:1 · black {c.contrastBlack}:1
                        </span>
                      </>
                    ) : (
                      <code data-testid={`color-invalid-${i}`}>{c.input} (invalid)</code>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <pre className="toml-output" data-testid="color-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json' ? parsed.json : viewMode === 'normalized' ? parsed.normalized : parsed.markdown}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="color-no-document">
            No colors yet. Paste a color above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
