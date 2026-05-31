import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';
import type { HexMode } from '@nekotools/lens-hex';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseHexInput } from './hex-parse.js';

/**
 * NekoHex sub-app. Wires `@nekotools/lens-hex` into the shared web-suite
 * shell as a Utility tool tab. Free surface: paste text (UTF-8) or a hex
 * string, see a classic offset / hex / ASCII dump + byte count, and copy
 * the dump / JSON / markdown. Pro (gated by the suite license): export the
 * bytes as a C unsigned-char array or a base64 string. All local.
 */

export type HexViewMode = 'dump' | 'json' | 'markdown' | 'c-array' | 'base64';

export interface NekoHexUiState {
  readonly mode: HexMode;
  readonly viewMode: HexViewMode;
}

export interface HexAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoHexUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const PRO_VIEWS = new Set<HexViewMode>(['c-array', 'base64']);
const VIEW_MODES: readonly HexViewMode[] = ['dump', 'json', 'markdown', 'c-array', 'base64'];
const VIEW_LABELS: Record<HexViewMode, string> = {
  dump: 'Dump',
  json: 'JSON',
  markdown: 'Markdown',
  'c-array': 'C array ⭐',
  base64: 'Base64 ⭐',
};
const COPY_LABELS: Record<HexViewMode, string> = {
  dump: 'Copy dump',
  json: 'Copy JSON',
  markdown: 'Copy markdown summary',
  'c-array': 'Copy C array',
  base64: 'Copy base64',
};

const SAMPLE_INPUT = 'Hello, NekoHex! 👋';

export function HexApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: HexAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [mode, setMode] = useState<HexMode>(initialUiState?.mode ?? 'text');
  const [viewMode, setViewMode] = useState<HexViewMode>(initialUiState?.viewMode ?? 'dump');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseHexInput(input, mode, effectiveEntitlement),
    [input, mode, effectiveEntitlement],
  );
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);

  const outputText =
    viewMode === 'json'
      ? parsed.json
      : viewMode === 'markdown'
        ? parsed.markdown
        : viewMode === 'c-array'
          ? parsed.cArray
          : viewMode === 'base64'
            ? parsed.base64
            : parsed.dump;
  const copyText = outputText ?? '';

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
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="hexViewMode"
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
              data-testid="hex-copy-output"
            >
              {COPY_LABELS[viewMode]}
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
          isProView && !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="hex-locked">
              <strong>{viewMode === 'c-array' ? 'C array export' : 'Base64 export'} is a Pro feature.</strong>
              <p>
                Export these bytes as a ready-to-paste C <code>unsigned char</code> array (with a
                length constant) or a standard base64 string. Unlock with a license key (verified
                locally, works offline forever).
              </p>
            </div>
          ) : (
            <pre className="toml-output hex-dump" data-testid="hex-output" aria-label={`${viewMode} output`}>
              {outputText}
            </pre>
          )
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
