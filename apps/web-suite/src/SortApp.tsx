import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';
import type { SortOptions, SortOrder } from '@nekotools/lens-sort';

import { Diagnostics } from './Diagnostics.js';
import { FileLoadControl } from './FileLoadControl.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseSortInput } from './sort-parse.js';

/**
 * NekoSort sub-app. Wires `@nekotools/lens-sort` into the shared web-suite
 * shell as a Text tool tab. Free surface: paste lines, toggle the options
 * (order, unique, case-insensitive, numeric, trim, remove-blank), see the
 * transformed result + counts, and copy. Pro (gated by the suite license):
 * export a CSV of line frequencies. All local.
 */

export type SortViewMode = 'result' | 'json' | 'markdown' | 'frequency';

export interface NekoSortUiState {
  readonly options: Partial<SortOptions>;
  readonly viewMode: SortViewMode;
}

export interface SortAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoSortUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const PRO_VIEWS = new Set<SortViewMode>(['frequency']);
const VIEW_MODES: readonly SortViewMode[] = ['result', 'json', 'markdown', 'frequency'];
const VIEW_LABELS: Record<SortViewMode, string> = {
  result: 'Result',
  json: 'JSON',
  markdown: 'Markdown',
  frequency: 'Frequency ⭐',
};
const COPY_LABELS: Record<SortViewMode, string> = {
  result: 'Copy result',
  json: 'Copy JSON',
  markdown: 'Copy markdown summary',
  frequency: 'Copy frequency CSV',
};

const SAMPLE_INPUT = ['banana', 'apple', 'cherry', 'apple', 'Banana'].join('\n');

const DEFAULTS: SortOptions = {
  order: 'asc',
  unique: false,
  caseInsensitive: false,
  numeric: false,
  trimLines: false,
  removeBlank: false,
};

export function SortApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: SortAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [options, setOptions] = useState<SortOptions>({ ...DEFAULTS, ...initialUiState?.options });
  const [viewMode, setViewMode] = useState<SortViewMode>(initialUiState?.viewMode ?? 'result');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseSortInput(input, options, effectiveEntitlement),
    [input, options, effectiveEntitlement],
  );
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);

  const outputText =
    viewMode === 'json'
      ? parsed.json
      : viewMode === 'markdown'
        ? parsed.markdown
        : viewMode === 'frequency'
          ? parsed.frequency
          : parsed.result;
  const copyText = outputText ?? '';

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [copyText, clipboardDeps]);

  const toggle = (key: keyof SortOptions) => (e: ChangeEvent<HTMLInputElement>) =>
    setOptions((o) => ({ ...o, [key]: e.target.checked }));

  return (
    <section className="tool tool--sort" aria-label="NekoSort workbench">
      <section className="paste card">
        <label htmlFor="sort-paste" className="paste__label">
          Paste lines to sort / dedupe:
        </label>
        <FileLoadControl
          onText={(text) => setInput(text)}
          testId="sort-file"
          label="…or load a file"
          ariaLabel="Load a local file to sort"
        />
        <textarea
          id="sort-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={6}
          data-testid="sort-input"
        />
        <div className="results__toolbar sort-options">
          <fieldset className="viewmode" aria-label="Sort order">
            <legend className="visually-hidden">Sort order</legend>
            {(['asc', 'desc', 'original'] as const).map((ord) => (
              <label key={ord} className={options.order === ord ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="sortOrder"
                  value={ord}
                  checked={options.order === ord}
                  onChange={() => setOptions((o) => ({ ...o, order: ord as SortOrder }))}
                />
                {ord === 'asc' ? 'A→Z' : ord === 'desc' ? 'Z→A' : 'Original'}
              </label>
            ))}
          </fieldset>
          <label className="cookies-mask">
            <input type="checkbox" checked={options.unique} onChange={toggle('unique')} data-testid="sort-unique" />
            Unique
          </label>
          <label className="cookies-mask">
            <input type="checkbox" checked={options.caseInsensitive} onChange={toggle('caseInsensitive')} data-testid="sort-ci" />
            Ignore case
          </label>
          <label className="cookies-mask">
            <input type="checkbox" checked={options.numeric} onChange={toggle('numeric')} data-testid="sort-numeric" />
            Numeric
          </label>
          <label className="cookies-mask">
            <input type="checkbox" checked={options.trimLines} onChange={toggle('trimLines')} data-testid="sort-trim" />
            Trim
          </label>
          <label className="cookies-mask">
            <input type="checkbox" checked={options.removeBlank} onChange={toggle('removeBlank')} data-testid="sort-removeblank" />
            Remove blanks
          </label>
        </div>
        <p className="paste__hint">Transformed entirely in your browser. Nothing uploaded.</p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Sort output mode">
            <legend className="visually-hidden">Sort output mode</legend>
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="sortViewMode"
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
              data-testid="sort-copy-output"
            >
              {COPY_LABELS[viewMode]}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="sort-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok ? `Copied to clipboard (via ${copyStatus.method}).` : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="sort-stats">
          <li>
            in: <strong data-testid="sort-stat-in">{parsed.inputCount}</strong>
          </li>
          <li>
            out: <strong data-testid="sort-stat-out">{parsed.outputCount}</strong>
          </li>
          <li>
            removed: <strong data-testid="sort-stat-removed">{parsed.removed}</strong>
          </li>
        </ul>

        {parsed.inputCount > 0 ? (
          isProView && !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="sort-locked">
              <strong>Frequency export is a Pro feature.</strong>
              <p>
                Export a CSV of how often each line occurs (<code>count,line</code>, most frequent
                first) — handy for log triage and tally counts. Unlock with a license key (verified
                locally, works offline forever).
              </p>
            </div>
          ) : (
            <pre className="toml-output" data-testid="sort-output" aria-label={`${viewMode} output`}>
              {outputText}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="sort-no-document">
            No lines yet. Paste some above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
