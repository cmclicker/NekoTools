import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseMimeInput } from './mime-parse.js';

/**
 * NekoMIME sub-app. Wires `@nekotools/lens-mime` into the shared web-suite
 * shell as a Web tool tab. Free surface: paste Content-Type strings / MIME
 * types / file extensions (one per line), see essence, suffix, registration
 * tree, parameters, and known extensions, and copy JSON / normalized /
 * markdown. Pro (gated by the suite license): export an IANA-lookup Markdown
 * report or an RFC-4180 CSV grid. All local.
 */

export type MimeViewMode = 'table' | 'json' | 'normalized' | 'markdown' | 'iana-lookup' | 'csv';

export interface NekoMimeUiState {
  readonly viewMode: MimeViewMode;
}

export interface MimeAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoMimeUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const PRO_VIEWS = new Set<MimeViewMode>(['iana-lookup', 'csv']);
const VIEW_MODES: readonly MimeViewMode[] = [
  'table',
  'json',
  'normalized',
  'markdown',
  'iana-lookup',
  'csv',
];
const VIEW_LABELS: Record<MimeViewMode, string> = {
  table: 'Table',
  json: 'JSON',
  normalized: 'Essence list',
  markdown: 'Markdown',
  'iana-lookup': 'IANA lookup ⭐',
  csv: 'CSV ⭐',
};
const COPY_LABELS: Record<MimeViewMode, string> = {
  table: 'Copy markdown summary',
  json: 'Copy JSON',
  normalized: 'Copy essence list',
  markdown: 'Copy markdown summary',
  'iana-lookup': 'Copy IANA lookup',
  csv: 'Copy CSV',
};

const SAMPLE_INPUT = [
  'text/html; charset=UTF-8',
  'image/svg+xml',
  'multipart/form-data; boundary="--abc"',
  'application/vnd.ms-excel',
  'report.pdf',
].join('\n');

export function MimeApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: MimeAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<MimeViewMode>(initialUiState?.viewMode ?? 'table');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseMimeInput(input, effectiveEntitlement),
    [input, effectiveEntitlement],
  );
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);

  // Text rendered/copied for the non-table views (the table renders its own
  // grid; its copy affordance falls back to the markdown summary).
  const outputText =
    viewMode === 'json'
      ? parsed.json
      : viewMode === 'normalized'
        ? parsed.normalized
        : viewMode === 'iana-lookup'
          ? parsed.ianaLookup
          : viewMode === 'csv'
            ? parsed.csv
            : parsed.markdown;
  const copyText = outputText ?? '';
  const copyDisabled = viewMode === 'table' ? parsed.count === 0 : copyText === '';

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [copyText, clipboardDeps]);

  return (
    <section className="tool tool--mime" aria-label="NekoMIME workbench">
      <section className="paste card">
        <label htmlFor="mime-paste" className="paste__label">
          Paste Content-Type strings, MIME types, or file extensions (one per line):
        </label>
        <textarea
          id="mime-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={6}
          data-testid="mime-input"
        />
        <p className="paste__hint">
          Parsed entirely in your browser — no content sniffing, no network. Extension lookups use a
          common built-in table.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="MIME output mode">
            <legend className="visually-hidden">MIME output mode</legend>
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="mimeViewMode"
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
              data-testid="mime-copy-output"
            >
              {COPY_LABELS[viewMode]}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="mime-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok ? `Copied to clipboard (via ${copyStatus.method}).` : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="mime-stats">
          <li>
            entries: <strong data-testid="mime-stat-count">{parsed.count}</strong>
          </li>
        </ul>

        {parsed.count > 0 ? (
          isProView && !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="mime-locked">
              <strong>
                {viewMode === 'iana-lookup' ? 'IANA lookup export' : 'CSV export'} is a Pro feature.
              </strong>
              <p>
                Resolve every parsed entry against the bundled IANA common-subset table as a Markdown
                report, or export the full grid (input, validity, type, subtype, suffix, parameters,
                extensions, category) as RFC-4180 CSV. Unlock with a license key (verified locally,
                works offline forever).
              </p>
            </div>
          ) : viewMode === 'table' ? (
            <table className="url-params" data-testid="mime-table">
              <thead>
                <tr>
                  <th scope="col">input</th>
                  <th scope="col">essence</th>
                  <th scope="col">tree</th>
                  <th scope="col">suffix</th>
                  <th scope="col">params</th>
                  <th scope="col">extensions</th>
                </tr>
              </thead>
              <tbody>
                {parsed.entries.map((e, i) => (
                  <tr key={`${e.input}-${i}`} data-valid={e.valid}>
                    <td>{e.input}</td>
                    <td data-testid={`mime-essence-${i}`}>{e.value?.essence ?? '(invalid)'}</td>
                    <td>{e.value?.tree ?? '—'}</td>
                    <td>{e.value?.suffix ?? '—'}</td>
                    <td>
                      {e.value && e.value.parameters.length > 0
                        ? e.value.parameters.map((p) => `${p.name}=${p.value}`).join('; ')
                        : '—'}
                    </td>
                    <td>{e.value && e.value.extensions.length > 0 ? e.value.extensions.join(', ') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre className="toml-output" data-testid="mime-output" aria-label={`${viewMode} output`}>
              {outputText}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="mime-no-document">
            No entries yet. Paste a Content-Type or extension above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
