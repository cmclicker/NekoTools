import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseLicenseInput } from './license-parse.js';

/**
 * NekoLicense sub-app. Wires `@nekotools/lens-license` into the shared
 * web-suite shell as a Project tool tab. Free surface: paste a LICENSE
 * file, see the detected SPDX id + its category and
 * permissions/conditions/limitations, and copy JSON / id / markdown. Local.
 */

export type LicenseViewMode = 'summary' | 'json' | 'markdown';

export interface NekoLicenseUiState {
  readonly viewMode: LicenseViewMode;
}

export interface LicenseAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoLicenseUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = [
  'MIT License',
  '',
  'Copyright (c) 2026 Example',
  '',
  'Permission is hereby granted, free of charge, to any person obtaining a copy',
  'of this software and associated documentation files (the "Software"), to deal',
  'in the Software without restriction...',
].join('\n');

export function LicenseApp({ initialInput, initialUiState, clipboardDeps }: LicenseAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<LicenseViewMode>(initialUiState?.viewMode ?? 'summary');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseLicenseInput(input), [input]);

  const copyText = viewMode === 'json' ? parsed.json : parsed.markdown;

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [copyText, clipboardDeps]);

  const meta = parsed.meta;

  return (
    <section className="tool tool--license" aria-label="NekoLicense workbench">
      <section className="paste card">
        <label htmlFor="license-paste" className="paste__label">
          Paste a LICENSE file (or an SPDX-License-Identifier line):
        </label>
        <textarea
          id="license-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={10}
          data-testid="license-input"
        />
        <p className="paste__hint">
          Detection runs entirely in your browser. Heuristic + informational — not legal advice.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="License output mode">
            <legend className="visually-hidden">License output mode</legend>
            {(['summary', 'json', 'markdown'] as const).map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="licenseViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {m === 'summary' ? 'Summary' : m === 'json' ? 'JSON' : 'Markdown'}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyText === ''}
              data-testid="license-copy-output"
            >
              {viewMode === 'json' ? 'Copy JSON' : 'Copy markdown summary'}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="license-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok ? `Copied to clipboard (via ${copyStatus.method}).` : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="license-stats">
          <li>
            detected: <strong data-testid="license-stat-id">{parsed.primary ?? '(unknown)'}</strong>
          </li>
          {parsed.spdxTag ? (
            <li>
              SPDX tag: <strong>{parsed.spdxTag}</strong>
            </li>
          ) : null}
        </ul>

        {viewMode === 'summary' ? (
          parsed.primary !== null && meta !== null ? (
            <dl className="url-fields" data-testid="license-summary">
              <div className="url-field">
                <dt>license</dt>
                <dd>{meta.name}</dd>
              </div>
              <div className="url-field">
                <dt>category</dt>
                <dd data-testid="license-category">{meta.category}</dd>
              </div>
              <div className="url-field">
                <dt>permissions</dt>
                <dd>{meta.permissions.join(', ') || '—'}</dd>
              </div>
              <div className="url-field">
                <dt>conditions</dt>
                <dd>{meta.conditions.join(', ') || '—'}</dd>
              </div>
              <div className="url-field">
                <dt>limitations</dt>
                <dd>{meta.limitations.join(', ') || '—'}</dd>
              </div>
            </dl>
          ) : (
            <div role="status" className="empty-state" data-testid="license-no-document">
              No known license detected. Paste a full LICENSE file or an SPDX tag.
            </div>
          )
        ) : (
          <pre className="toml-output" data-testid="license-output" aria-label={`${viewMode} output`}>
            {viewMode === 'json' ? parsed.json : parsed.markdown}
          </pre>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
