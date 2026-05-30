import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseLicenseInput } from './license-parse.js';

/**
 * NekoLicense sub-app. Wires `@nekotools/lens-license` into the shared
 * web-suite shell as a Project tool tab. Free surface: paste a LICENSE file,
 * see the detected SPDX id + its category and permissions/conditions/
 * limitations, and copy JSON / markdown. Pro (gated by the suite license): an
 * obligations & risk audit (copyleft / AGPL / disclose-source) + SARIF export
 * for CI. Local; detection is heuristic + informational, not legal advice.
 */

export type LicenseViewMode = 'summary' | 'json' | 'markdown' | 'audit' | 'sarif';

export interface NekoLicenseUiState {
  readonly viewMode: LicenseViewMode;
}

export interface LicenseAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoLicenseUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const PRO_VIEWS = new Set<LicenseViewMode>(['audit', 'sarif']);
const VIEW_MODES: readonly LicenseViewMode[] = ['summary', 'json', 'markdown', 'audit', 'sarif'];
const VIEW_LABELS: Record<LicenseViewMode, string> = {
  summary: 'Summary',
  json: 'JSON',
  markdown: 'Markdown',
  audit: 'Audit ⭐',
  sarif: 'SARIF ⭐',
};
const COPY_LABELS: Record<LicenseViewMode, string> = {
  summary: 'Copy markdown summary',
  json: 'Copy JSON',
  markdown: 'Copy markdown summary',
  audit: 'Copy audit',
  sarif: 'Copy SARIF',
};

const SAMPLE_INPUT = [
  'MIT License',
  '',
  'Copyright (c) 2026 Example',
  '',
  'Permission is hereby granted, free of charge, to any person obtaining a copy',
  'of this software and associated documentation files (the "Software"), to deal',
  'in the Software without restriction...',
].join('\n');

export function LicenseApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: LicenseAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<LicenseViewMode>(initialUiState?.viewMode ?? 'summary');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseLicenseInput(input, effectiveEntitlement),
    [input, effectiveEntitlement],
  );
  const meta = parsed.meta;
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);

  const outputText =
    viewMode === 'json'
      ? parsed.json
      : viewMode === 'markdown'
        ? parsed.markdown
        : viewMode === 'audit'
          ? parsed.auditReport
          : viewMode === 'sarif'
            ? parsed.sarif
            : null; // summary
  const copyText = viewMode === 'summary' ? parsed.markdown : (outputText ?? '');

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [copyText, clipboardDeps]);

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
          Detection and auditing run entirely in your browser. Heuristic + informational — not legal
          advice.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="License output mode">
            <legend className="visually-hidden">License output mode</legend>
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="licenseViewMode"
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
              data-testid="license-copy-output"
            >
              {COPY_LABELS[viewMode]}
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

        {isProView && !proUnlocked ? (
          <div className="pro-lock" role="status" data-testid="license-locked">
            <strong>{viewMode === 'audit' ? 'Obligations & risk audit' : 'SARIF export'} is a Pro feature.</strong>
            <p>
              Audit the detected license for copyleft / AGPL network-copyleft risk, source-disclosure
              and same-license obligations, and SPDX-tag mismatches — and export SARIF 2.1.0 to gate
              license risk in CI. Unlock with a license key (verified locally, works offline forever).
            </p>
          </div>
        ) : viewMode === 'summary' ? (
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
            {outputText}
          </pre>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
