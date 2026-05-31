import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { FileLoadControl } from './FileLoadControl.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseIniInput } from './ini-parse.js';

/**
 * NekoINI sub-app. Wires `@nekotools/lens-ini` into the shared web-suite
 * shell as a DATA tool tab. Free surface: paste INI / .properties /
 * .editorconfig, see sections + entries, convert to JSON, normalize, and
 * copy. Pro (gated by the suite license): convert the document to dotenv
 * (.env) or TOML. All local.
 */

export type IniViewMode = 'sections' | 'json' | 'normalized' | 'markdown' | 'env' | 'toml';

export interface NekoIniUiState {
  readonly viewMode: IniViewMode;
}

export interface IniAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoIniUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const PRO_VIEWS = new Set<IniViewMode>(['env', 'toml']);
const VIEW_MODES: readonly IniViewMode[] = [
  'sections',
  'json',
  'normalized',
  'markdown',
  'env',
  'toml',
];
const VIEW_LABELS: Record<IniViewMode, string> = {
  sections: 'Sections',
  json: 'JSON',
  normalized: 'Normalized',
  markdown: 'Markdown',
  env: 'dotenv ⭐',
  toml: 'TOML ⭐',
};
const COPY_LABELS: Record<IniViewMode, string> = {
  sections: 'Copy JSON',
  json: 'Copy JSON',
  normalized: 'Copy normalized',
  markdown: 'Copy markdown summary',
  env: 'Copy dotenv',
  toml: 'Copy TOML',
};

const SAMPLE_INPUT = [
  '; app configuration',
  'debug = true',
  '',
  '[server]',
  'host = localhost',
  'port = 8080',
  '',
  '[database]',
  'name = app',
  'pool : 10',
].join('\n');

export function IniApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: IniAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<IniViewMode>(initialUiState?.viewMode ?? 'sections');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseIniInput(input, effectiveEntitlement),
    [input, effectiveEntitlement],
  );
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);

  // Output string for every non-`sections` view; null for a locked Pro view.
  const output =
    viewMode === 'json'
      ? parsed.json
      : viewMode === 'normalized'
        ? parsed.normalized
        : viewMode === 'markdown'
          ? parsed.markdown
          : viewMode === 'env'
            ? parsed.env
            : viewMode === 'toml'
              ? parsed.toml
              : null;

  const copyText = output ?? '';
  const copyDisabled = viewMode === 'sections' ? parsed.keyCount === 0 : copyText === '';

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [copyText, clipboardDeps]);

  const hasContent = parsed.sections.some((s) => s.entries.length > 0);

  return (
    <section className="tool tool--ini" aria-label="NekoINI workbench">
      <section className="paste card">
        <div className="paste__head">
          <label htmlFor="ini-paste" className="paste__label">
            Paste INI / .properties / .editorconfig:
          </label>
          <FileLoadControl
            onText={(text) => setInput(text)}
            testId="ini-file"
            label="…or load a file"
            ariaLabel="Load a local INI file"
          />
        </div>
        <textarea
          id="ini-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={10}
          data-testid="ini-input"
        />
        <p className="paste__hint">
          Parsing runs entirely in your browser. Values are kept as raw strings. Nothing uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="INI output mode">
            <legend className="visually-hidden">INI output mode</legend>
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="iniViewMode"
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
              data-testid="ini-copy-output"
            >
              {COPY_LABELS[viewMode]}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="ini-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="ini-stats">
          <li>
            sections: <strong data-testid="ini-stat-sections">{parsed.sectionCount}</strong>
          </li>
          <li>
            keys: <strong data-testid="ini-stat-keys">{parsed.keyCount}</strong>
          </li>
        </ul>

        {hasContent ? (
          viewMode === 'sections' ? (
            <div data-testid="ini-sections">
              {parsed.sections.map((section) => (
                <div className="ini-section" key={section.name || '(global)'}>
                  <h4 className="ini-section__name">{section.name === '' ? '(global)' : section.name}</h4>
                  <dl className="url-fields">
                    {section.entries.map((e) => (
                      <div className="url-field" key={e.key}>
                        <dt>{e.key}</dt>
                        <dd>{e.value === '' ? '(empty)' : e.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          ) : isProView && !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="ini-locked">
              <strong>{viewMode === 'env' ? 'dotenv (.env) export' : 'TOML export'} is a Pro feature.</strong>
              <p>
                Convert this document to a dotenv file or a TOML document (sections become tables,
                values stay raw strings). Unlock with a license key (verified locally, works offline
                forever).
              </p>
            </div>
          ) : (
            <pre className="toml-output" data-testid="ini-output" aria-label={`${viewMode} output`}>
              {output}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="ini-no-document">
            No entries yet. Paste an INI document above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
