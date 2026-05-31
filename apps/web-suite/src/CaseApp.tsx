import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';
import { CASE_FORMS } from '@nekotools/lens-case';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseCaseInput } from './case-parse.js';

/**
 * NekoCase sub-app. Wires `@nekotools/lens-case` into the shared web-suite
 * shell as a Text tool tab. Free surface: paste phrases/identifiers (one
 * per line), see every case form, and copy JSON / slug list / markdown.
 * Pro (gated by the suite license): a CSV grid of every form, or a single
 * chosen form (default camelCase) per line. All local.
 */

export type CaseViewMode = 'forms' | 'json' | 'normalized' | 'markdown' | 'csv' | 'single-form';

export interface NekoCaseUiState {
  readonly viewMode: CaseViewMode;
}

export interface CaseAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoCaseUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const PRO_VIEWS = new Set<CaseViewMode>(['csv', 'single-form']);
const VIEW_MODES: readonly CaseViewMode[] = [
  'forms',
  'json',
  'normalized',
  'markdown',
  'csv',
  'single-form',
];
const VIEW_LABELS: Record<CaseViewMode, string> = {
  forms: 'Forms',
  json: 'JSON',
  normalized: 'Slug list',
  markdown: 'Markdown',
  csv: 'CSV ⭐',
  'single-form': 'Single form ⭐',
};

const SAMPLE_INPUT = 'helloWorld example';

const FORM_LABELS: Record<string, string> = {
  lower: 'lower',
  upper: 'UPPER',
  title: 'Title Case',
  sentence: 'Sentence case',
  camel: 'camelCase',
  pascal: 'PascalCase',
  snake: 'snake_case',
  constant: 'CONSTANT_CASE',
  kebab: 'kebab-case',
  dot: 'dot.case',
  slug: 'slug',
};

export function CaseApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: CaseAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<CaseViewMode>(initialUiState?.viewMode ?? 'forms');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseCaseInput(input, effectiveEntitlement),
    [input, effectiveEntitlement],
  );
  const first = parsed.entries[0];
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);

  const outputText =
    viewMode === 'json'
      ? parsed.json
      : viewMode === 'normalized'
        ? parsed.normalized
        : viewMode === 'markdown'
          ? parsed.markdown
          : viewMode === 'csv'
            ? parsed.csv
            : viewMode === 'single-form'
              ? parsed.singleForm
              : null;
  const copyText = outputText ?? '';
  const copyDisabled = viewMode === 'forms' ? parsed.count === 0 : copyText === '';

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [copyText, clipboardDeps]);

  return (
    <section className="tool tool--case" aria-label="NekoCase workbench">
      <section className="paste card">
        <label htmlFor="case-paste" className="paste__label">
          Paste phrases or identifiers (one per line):
        </label>
        <textarea
          id="case-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={4}
          data-testid="case-input"
        />
        <p className="paste__hint">
          Transformed entirely in your browser — separators, camelCase humps, and digit boundaries
          are all detected. Nothing uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Case output mode">
            <legend className="visually-hidden">Case output mode</legend>
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="caseViewMode"
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
              data-testid="case-copy-output"
            >
              {viewMode === 'json'
                ? 'Copy JSON'
                : viewMode === 'normalized'
                  ? 'Copy slug list'
                  : viewMode === 'markdown'
                    ? 'Copy markdown summary'
                    : viewMode === 'csv'
                      ? 'Copy CSV'
                      : 'Copy single form'}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="case-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok ? `Copied to clipboard (via ${copyStatus.method}).` : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="case-stats">
          <li>
            entries: <strong data-testid="case-stat-count">{parsed.count}</strong>
          </li>
        </ul>

        {parsed.count > 0 ? (
          viewMode === 'forms' ? (
            first !== undefined ? (
              <dl className="url-fields" data-testid="case-forms">
                {CASE_FORMS.map((f) => (
                  <div className="url-field" key={f}>
                    <dt>{FORM_LABELS[f] ?? f}</dt>
                    <dd data-testid={`case-form-${f}`}>{first.forms[f] || '(empty)'}</dd>
                  </div>
                ))}
              </dl>
            ) : null
          ) : isProView && !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="case-locked">
              <strong>{viewMode === 'csv' ? 'CSV grid export' : 'Single-form export'} is a Pro feature.</strong>
              <p>
                Export every case form as a CSV grid (one row per input — ready for a bulk-rename
                sheet) or render a single chosen form (default camelCase), one per line. Unlock with
                a license key (verified locally, works offline forever).
              </p>
            </div>
          ) : (
            <pre className="toml-output" data-testid="case-output" aria-label={`${viewMode} output`}>
              {outputText}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="case-no-document">
            Nothing to transform yet. Paste a phrase above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
