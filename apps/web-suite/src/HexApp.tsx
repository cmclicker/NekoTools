import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { HexMode } from '@nekotools/lens-hex';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseHexInput } from './hex-parse.js';

/**
 * NekoHex sub-app. Wires `@nekotools/lens-hex` into the shared web-suite
 * shell as a Utility tool tab. Free surface: paste text (UTF-8) or a hex
 * string, see a classic offset / hex / ASCII dump + byte count, and copy
 * the dump / JSON / markdown. All local.
 */

export type HexViewMode = 'dump' | 'json' | 'markdown';

export interface NekoHexUiState {
  readonly mode: HexMode;
  readonly viewMode: HexViewMode;
}

export interface HexAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoHexUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = 'Hello, NekoHex! 👋';

export function HexApp({ initialInput, initialUiState, clipboardDeps }: HexAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [mode, setMode] = useState<HexMode>(initialUiState?.mode ?? 'text');
  const [viewMode, setViewMode] = useState<HexViewMode>(initialUiState?.viewMode ?? 'dump');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseHexInput(input, mode), [input, mode]);

  const copyText = viewMode === 'json' ? parsed.json : viewMode === 'markdown' ? parsed.markdown : parsed.dump;

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [copyText, clipboardDeps]);

  return (
    <section className="tool tool--hex" aria-label="NekoHex workbench">
      <section className="paste card">
        <label htmlFor="hex-paste" className="paste__label">
          Paste text or a hex string:
        </label>
        <textarea
          id="hex-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={4}
          data-testid="hex-input"
        />
        <fieldset className="viewmode" aria-label="Input mode">
          <legend className="visually-hidden">Input mode</legend>
          <label className={mode === 'text' ? 'viewmode--active' : ''}>
            <input type="radio" name="hexMode" value="text" checked={mode === 'text'} onChange={() => setMode('text')} data-testid="hex-mode-text" />
            Text → hex
          </label>
          <label className={mode === 'hex' ? 'viewmode--active' : ''}>
            <input type="radio" name="hexMode" value="hex" checked={mode === 'hex'} onChange={() => setMode('hex')} data-testid="hex-mode-hex" />
            Hex → bytes
          </label>
        </fieldset>
        <p className="paste__hint">Rendered entirely in your browser. Nothing uploaded.</p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Hex output mode">
            <legend className="visually-hidden">Hex output mode</legend>
            {(['dump', 'json', 'markdown'] as const).map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="hexViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {m === 'dump' ? 'Dump' : m === 'json' ? 'JSON' : 'Markdown'}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyText === ''}
              data-testid="hex-copy-output"
            >
              {viewMode === 'json' ? 'Copy JSON' : viewMode === 'markdown' ? 'Copy markdown summary' : 'Copy dump'}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="hex-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok ? `Copied to clipboard (via ${copyStatus.method}).` : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="hex-stats">
          <li>
            bytes: <strong data-testid="hex-stat-bytes">{parsed.byteLength}</strong>
          </li>
          <li>
            mode: <strong>{parsed.mode}</strong>
          </li>
        </ul>

        {parsed.valid && parsed.byteLength > 0 ? (
          <pre className="toml-output hex-dump" data-testid="hex-output" aria-label={`${viewMode} output`}>
            {viewMode === 'json' ? parsed.json : viewMode === 'markdown' ? parsed.markdown : parsed.dump}
          </pre>
        ) : (
          <div role="status" className="empty-state" data-testid="hex-no-document">
            {parsed.valid ? 'Nothing to dump yet. Paste text or hex above.' : 'Invalid hex — check the diagnostics below.'}
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
