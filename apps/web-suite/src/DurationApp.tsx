import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseDurationInput } from './duration-parse.js';

/**
 * NekoDuration sub-app. Wires `@nekotools/lens-duration` into the shared
 * web-suite shell as a Utility tool tab. Free surface: paste durations
 * (ISO-8601 / humanized / seconds, one per line), see total seconds +
 * normalized ISO + human form, and copy JSON / ISO list / markdown. Pro
 * (gated by the suite license): export a per-input d/h/m/s breakdown CSV.
 * All local.
 */

export type DurationViewMode = 'table' | 'json' | 'normalized' | 'markdown' | 'breakdown';

export interface NekoDurationUiState {
  readonly viewMode: DurationViewMode;
}

export interface DurationAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoDurationUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const PRO_VIEWS = new Set<DurationViewMode>(['breakdown']);

const SAMPLE_INPUT = ['PT1H30M', '90 min', '1d 2h', '3600', '1.5h'].join('\n');

export function DurationApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: DurationAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<DurationViewMode>(initialUiState?.viewMode ?? 'table');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseDurationInput(input, effectiveEntitlement),
    [input, effectiveEntitlement],
  );
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);

  const copyText =
    viewMode === 'json'
      ? parsed.json
      : viewMode === 'normalized'
        ? parsed.normalized
        : viewMode === 'breakdown'
          ? parsed.breakdownCsv ?? ''
          : parsed.markdown;
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
    <section className="tool tool--duration" aria-label="NekoDuration workbench">
      <section className="paste card">
        <label htmlFor="duration-paste" className="paste__label">
          Paste durations (ISO-8601, humanized, or seconds — one per line):
        </label>
        <textarea
          id="duration-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={6}
          data-testid="duration-input"
        />
        <p className="paste__hint">
          Converted entirely in your browser. Years/months use average lengths (365.25 d / 30.44 d).
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Duration output mode">
            <legend className="visually-hidden">Duration output mode</legend>
            {(['table', 'json', 'normalized', 'markdown', 'breakdown'] as const).map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="durationViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {m === 'table'
                  ? 'Table'
                  : m === 'json'
                    ? 'JSON'
                    : m === 'normalized'
                      ? 'ISO list'
                      : m === 'markdown'
                        ? 'Markdown'
                        : 'Breakdown CSV ⭐'}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={copyDisabled}
              data-testid="duration-copy-output"
            >
              {viewMode === 'json'
                ? 'Copy JSON'
                : viewMode === 'normalized'
                  ? 'Copy ISO list'
                  : viewMode === 'breakdown'
                    ? 'Copy breakdown CSV'
                    : 'Copy markdown summary'}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="duration-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok ? `Copied to clipboard (via ${copyStatus.method}).` : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="duration-stats">
          <li>
            entries: <strong data-testid="duration-stat-count">{parsed.count}</strong>
          </li>
        </ul>

        {parsed.count > 0 ? (
          viewMode === 'table' ? (
            <table className="url-params" data-testid="duration-table">
              <thead>
                <tr>
                  <th scope="col">input</th>
                  <th scope="col">total seconds</th>
                  <th scope="col">ISO-8601</th>
                  <th scope="col">human</th>
                </tr>
              </thead>
              <tbody>
                {parsed.entries.map((e, i) => (
                  <tr key={`${e.input}-${i}`} data-valid={e.valid}>
                    <td>{e.input}</td>
                    <td data-testid={`duration-seconds-${i}`}>{e.value?.totalSeconds ?? '—'}</td>
                    <td data-testid={`duration-iso-${i}`}>{e.value?.iso ?? '(invalid)'}</td>
                    <td>{e.value?.human ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : isProView && !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="duration-locked">
              <strong>Breakdown CSV export is a Pro feature.</strong>
              <p>
                Export a spreadsheet-ready CSV with each input&apos;s total seconds and its
                day/hour/minute/second breakdown alongside the normalized ISO form. Unlock with a
                license key (verified locally, works offline forever).
              </p>
            </div>
          ) : (
            <pre className="toml-output" data-testid="duration-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json'
                ? parsed.json
                : viewMode === 'normalized'
                  ? parsed.normalized
                  : viewMode === 'breakdown'
                    ? parsed.breakdownCsv
                    : parsed.markdown}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="duration-no-document">
            No durations yet. Paste one above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
