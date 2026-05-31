import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseColorInput } from './color-parse.js';

/**
 * NekoColor sub-app. Wires `@nekotools/lens-color` into the shared
 * web-suite shell as a Utility tool tab. Free surface: paste colors (one
 * per line) in hex / rgb() / hsl() / CSS names, see a swatch + normalized
 * forms + WCAG contrast vs white/black, and copy JSON / hex list / markdown.
 * Pro (gated by the suite license): a 50–900 tint/shade palette and a set of
 * :root CSS custom properties. All local.
 */

export type ColorViewMode = 'swatches' | 'json' | 'normalized' | 'markdown' | 'palette' | 'css-vars';

export interface NekoColorUiState {
  readonly viewMode: ColorViewMode;
}

export interface ColorAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoColorUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const PRO_VIEWS = new Set<ColorViewMode>(['palette', 'css-vars']);
const VIEW_MODES: readonly ColorViewMode[] = [
  'swatches',
  'json',
  'normalized',
  'markdown',
  'palette',
  'css-vars',
];
const VIEW_LABELS: Record<ColorViewMode, string> = {
  swatches: 'Swatches',
  json: 'JSON',
  normalized: 'Hex list',
  markdown: 'Markdown',
  palette: 'Palette ⭐',
  'css-vars': 'CSS vars ⭐',
};

const SAMPLE_INPUT = ['#3366ff', 'rgb(255, 99, 71)', 'hsl(120, 60%, 40%)', 'teal', '#1118'].join('\n');

export function ColorApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: ColorAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<ColorViewMode>(initialUiState?.viewMode ?? 'swatches');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseColorInput(input, effectiveEntitlement),
    [input, effectiveEntitlement],
  );
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);
  const proOutput = viewMode === 'palette' ? parsed.palette : viewMode === 'css-vars' ? parsed.cssVars : null;

  const copyText =
    viewMode === 'json'
      ? parsed.json
      : viewMode === 'normalized'
        ? parsed.normalized
        : viewMode === 'markdown'
          ? parsed.markdown
          : (proOutput ?? '');
  const copyDisabled = viewMode === 'swatches' ? parsed.count === 0 : copyText === '';
  const copyLabel =
    viewMode === 'json'
      ? 'Copy JSON'
      : viewMode === 'normalized'
        ? 'Copy hex list'
        : viewMode === 'markdown'
          ? 'Copy markdown summary'
          : viewMode === 'palette'
            ? 'Copy palette'
            : 'Copy CSS vars';

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [copyText, clipboardDeps]);

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
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="colorViewMode"
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
              disabled={copyDisabled}
              data-testid="color-copy-output"
            >
              {copyLabel}
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
          ) : isProView && !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="color-locked">
              <strong>{viewMode === 'palette' ? 'Tint/shade palette' : 'CSS custom properties'} is a Pro feature.</strong>
              <p>
                Generate a full 50–900 tint/shade palette per color, or a set of <code>:root</code> CSS
                custom properties for the scale — straight from these colors. Unlock with a license key
                (verified locally, works offline forever).
              </p>
            </div>
          ) : (
            <pre className="toml-output" data-testid="color-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json'
                ? parsed.json
                : viewMode === 'normalized'
                  ? parsed.normalized
                  : viewMode === 'markdown'
                    ? parsed.markdown
                    : proOutput}
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
