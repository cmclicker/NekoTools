import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseUnicodeInput } from './unicode-parse.js';

/**
 * NekoUnicode sub-app. Wires `@nekotools/lens-unicode` into the shared
 * web-suite shell as a Utility tool tab. Free surface: paste text, see each
 * code point (U+ hex, decimal, UTF-8/UTF-16 bytes, category, escapes) and
 * summary counts, and copy JSON / U+ list / markdown. Pro (gated by the suite
 * license): export a `U+XXXX | char | name` markdown table or a per-codepoint
 * CSV grid. All local.
 */

export type UnicodeViewMode = 'table' | 'json' | 'normalized' | 'markdown' | 'names' | 'csv';

export interface NekoUnicodeUiState {
  readonly viewMode: UnicodeViewMode;
}

export interface UnicodeAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoUnicodeUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const PRO_VIEWS = new Set<UnicodeViewMode>(['names', 'csv']);
const VIEW_MODES: readonly UnicodeViewMode[] = ['table', 'json', 'normalized', 'markdown', 'names', 'csv'];
const VIEW_LABELS: Record<UnicodeViewMode, string> = {
  table: 'Table',
  json: 'JSON',
  normalized: 'U+ list',
  markdown: 'Markdown',
  names: 'Names ⭐',
  csv: 'CSV ⭐',
};
const COPY_LABELS: Record<UnicodeViewMode, string> = {
  table: 'Copy markdown summary',
  json: 'Copy JSON',
  normalized: 'Copy U+ list',
  markdown: 'Copy markdown summary',
  names: 'Copy names table',
  csv: 'Copy CSV',
};

const SAMPLE_INPUT = 'Café 😀 €';

export function UnicodeApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: UnicodeAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<UnicodeViewMode>(initialUiState?.viewMode ?? 'table');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseUnicodeInput(input, effectiveEntitlement),
    [input, effectiveEntitlement],
  );
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);

  const outputText =
    viewMode === 'json'
      ? parsed.json
      : viewMode === 'normalized'
        ? parsed.normalized
        : viewMode === 'names'
          ? parsed.names
          : viewMode === 'csv'
            ? parsed.csv
            : parsed.markdown;
  const copyText = outputText ?? '';
  const copyDisabled = viewMode === 'table' ? parsed.codepointCount === 0 : copyText === '';

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [copyText, clipboardDeps]);

  return (
    <section className="tool tool--unicode" aria-label="NekoUnicode workbench">
      <section className="paste card">
        <label htmlFor="unicode-paste" className="paste__label">
          Paste text to inspect code point by code point:
        </label>
        <textarea
          id="unicode-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={3}
          data-testid="unicode-input"
        />
        <p className="paste__hint">
          Analyzed entirely in your browser. Whitespace counts — every code point is shown. Nothing
          uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Unicode output mode">
            <legend className="visually-hidden">Unicode output mode</legend>
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="unicodeViewMode"
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
              data-testid="unicode-copy-output"
            >
              {COPY_LABELS[viewMode]}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="unicode-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok ? `Copied to clipboard (via ${copyStatus.method}).` : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="unicode-stats">
          <li>
            code points: <strong data-testid="unicode-stat-cp">{parsed.codepointCount}</strong>
          </li>
          <li>
            UTF-16 units: <strong data-testid="unicode-stat-units">{parsed.utf16UnitCount}</strong>
          </li>
          <li>
            bytes: <strong data-testid="unicode-stat-bytes">{parsed.byteLength}</strong>
          </li>
        </ul>

        {parsed.codepointCount > 0 ? (
          isProView && !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="unicode-locked">
              <strong>{viewMode === 'names' ? 'Names table export' : 'CSV export'} is a Pro feature.</strong>
              <p>
                Export every code point as a <code>U+XXXX | char | name</code> markdown table or a
                spreadsheet-ready CSV grid. Unlock with a license key (verified locally, works offline
                forever).
              </p>
            </div>
          ) : viewMode === 'table' ? (
            <table className="url-params" data-testid="unicode-table">
              <thead>
                <tr>
                  <th scope="col">char</th>
                  <th scope="col">codepoint</th>
                  <th scope="col">dec</th>
                  <th scope="col">category</th>
                  <th scope="col">UTF-8</th>
                  <th scope="col">escape</th>
                </tr>
              </thead>
              <tbody>
                {parsed.codepoints.map((c, i) => (
                  <tr key={`${c.codepoint}-${i}`}>
                    <td data-testid={`unicode-char-${i}`}>{c.isControl ? '·' : c.char}</td>
                    <td data-testid={`unicode-cp-${i}`}>{c.hex}</td>
                    <td>{c.decimal}</td>
                    <td>{c.category}</td>
                    <td>{c.utf8}</td>
                    <td>
                      <code>{c.jsEscape}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre className="toml-output" data-testid="unicode-output" aria-label={`${viewMode} output`}>
              {outputText}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="unicode-no-document">
            Nothing to inspect yet. Paste some text above.
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
