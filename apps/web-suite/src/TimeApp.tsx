import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseTimeInput } from './time-parse.js';

/**
 * NekoTime sub-app — the visible timestamp / time-conversion tab. Wires
 * `@nekotools/lens-time` into the shared web-suite shell. Free surface:
 * type a Unix timestamp (seconds or ms), an ISO-8601 string, or a date,
 * and see the ISO UTC, local time + offset, Unix seconds / milliseconds,
 * and relative age, plus copy/export affordances and line diagnostics.
 * Pro (gated by the suite license): an RFC-4180 batch CSV grid of the
 * resolved instant(s) and a timezone board rendering the instant across
 * major IANA zones. The shared `ProSurface` (Free/Pro) renders
 * automatically via the tool registry; this component is the panel only.
 */

export type TimeViewMode = 'summary' | 'batch-csv' | 'timezone-board';

export interface NekoTimeUiState {
  readonly viewMode: TimeViewMode;
}

const SAMPLE_INPUT = '1700000000';

const PRO_VIEWS = new Set<TimeViewMode>(['batch-csv', 'timezone-board']);
const VIEW_MODES: readonly TimeViewMode[] = ['summary', 'batch-csv', 'timezone-board'];
const VIEW_LABELS: Record<TimeViewMode, string> = {
  summary: 'Summary',
  'batch-csv': 'Batch CSV ⭐',
  'timezone-board': 'Timezone board ⭐',
};

export interface TimeAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoTimeUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly label: string;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

export function TimeApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: TimeAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<TimeViewMode>(initialUiState?.viewMode ?? 'summary');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseTimeInput(input, effectiveEntitlement),
    [input, effectiveEntitlement],
  );
  const instant = parsed.instant;
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);
  const proOutput = viewMode === 'batch-csv' ? parsed.batchCsv : parsed.timezoneBoard;

  const copyValue = useCallback(
    async (value: string | null, label: string) => {
      if (value === null || value === '') {
        setCopyStatus({ ok: false, label, method: 'none' });
        return;
      }
      const result = await copyToClipboard(value, clipboardDeps);
      setCopyStatus({ ok: result.ok, label, method: result.method });
    },
    [clipboardDeps],
  );

  const handleNow = useCallback(() => {
    // UI-only impurity (the engine never reads the wall clock): seed the
    // field with the current Unix milliseconds.
    setInput(String(Date.now()));
  }, []);

  return (
    <section className="tool tool--time" aria-label="NekoTime workbench">
      <section className="paste card">
        <label htmlFor="time-input" className="paste__label">
          Timestamp or date:
        </label>
        <div className="time-input-row">
          <input
            id="time-input"
            type="text"
            className="time-input"
            value={input}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="Unix seconds / ms, ISO-8601, or a date"
            data-testid="time-input"
          />
          <button type="button" className="copy__btn" onClick={handleNow} data-testid="time-now">
            Now
          </button>
        </div>
        <p className="paste__hint">
          Accepts Unix seconds, Unix milliseconds, ISO-8601, or a date string. Everything runs in
          your browser — no network, no telemetry, nothing uploaded.
        </p>
      </section>

      <section className="results card">
        {instant !== null ? (
          <>
            <div className="results__toolbar">
              <span
                className="time-interpretation"
                data-testid="time-interpretation"
                title="How the input was interpreted"
              >
                {instant.interpretation}
              </span>

              <fieldset className="viewmode" aria-label="Time view mode">
                <legend className="visually-hidden">Time view mode</legend>
                {VIEW_MODES.map((mode) => (
                  <label key={mode} className={viewMode === mode ? 'viewmode--active' : ''}>
                    <input
                      type="radio"
                      name="timeViewMode"
                      value={mode}
                      checked={viewMode === mode}
                      onChange={() => setViewMode(mode)}
                      data-testid={`time-view-${mode}`}
                    />
                    {VIEW_LABELS[mode]}
                  </label>
                ))}
              </fieldset>

              <div className="copy" role="group" aria-label="Copy and export affordances">
                <button
                  type="button"
                  className="copy__btn"
                  onClick={() => copyValue(parsed.isoOutput, 'ISO')}
                  data-testid="time-copy-iso"
                >
                  Copy ISO
                </button>
                <button
                  type="button"
                  className="copy__btn"
                  onClick={() => copyValue(parsed.jsonOutput, 'JSON')}
                  data-testid="time-copy-json"
                >
                  Copy JSON
                </button>
                <button
                  type="button"
                  className="copy__btn"
                  onClick={() => copyValue(parsed.markdownOutput, 'Markdown')}
                  data-testid="time-copy-markdown"
                >
                  Copy Markdown
                </button>
              </div>

              {copyStatus !== null ? (
                <p
                  className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
                  data-testid="time-copy-status"
                  data-method={copyStatus.method}
                  role="status"
                >
                  {copyStatus.ok
                    ? `Copied ${copyStatus.label} to clipboard (via ${copyStatus.method}).`
                    : `Copy ${copyStatus.label} failed: nothing to copy.`}
                </p>
              ) : null}
            </div>

            {isProView ? (
              !proUnlocked ? (
                <div className="pro-lock" role="status" data-testid="time-locked">
                  <strong>
                    {viewMode === 'batch-csv' ? 'Batch CSV export' : 'Timezone board'} is a Pro
                    feature.
                  </strong>
                  <p>
                    Export the resolved instant(s) as an RFC-4180 CSV grid, or render the instant
                    across major IANA zones as a markdown table. Unlock with a license key (verified
                    locally, works offline forever).
                  </p>
                </div>
              ) : (
                <pre
                  className="toml-output time-output"
                  data-testid="time-output"
                  aria-label={`${viewMode} output`}
                >
                  {proOutput}
                </pre>
              )
            ) : (
              <dl className="kv time-summary" data-testid="time-summary">
                <dt>ISO (UTC)</dt>
                <dd>
                  <code data-testid="time-iso">{instant.iso}</code>{' '}
                  <button
                    type="button"
                    className="time-copy-inline"
                    aria-label="Copy ISO UTC value"
                    onClick={() => copyValue(instant.iso, 'ISO')}
                  >
                    copy
                  </button>
                </dd>

                <dt>Local</dt>
                <dd data-testid="time-local">
                  {instant.local.formatted}{' '}
                  <span className="time-offset">
                    (UTC{instant.local.offsetLabel}, {instant.local.timeZone})
                  </span>
                </dd>

                <dt>Unix seconds</dt>
                <dd>
                  <code data-testid="time-epoch-seconds">{instant.epochSeconds}</code>{' '}
                  <button
                    type="button"
                    className="time-copy-inline"
                    aria-label="Copy Unix seconds value"
                    onClick={() => copyValue(String(instant.epochSeconds), 'Unix seconds')}
                  >
                    copy
                  </button>
                </dd>

                <dt>Unix milliseconds</dt>
                <dd>
                  <code data-testid="time-epoch-millis">{instant.epochMillis}</code>{' '}
                  <button
                    type="button"
                    className="time-copy-inline"
                    aria-label="Copy Unix milliseconds value"
                    onClick={() => copyValue(String(instant.epochMillis), 'Unix milliseconds')}
                  >
                    copy
                  </button>
                </dd>

                <dt>Relative</dt>
                <dd data-testid="time-relative">{instant.relative.label}</dd>
              </dl>
            )}
          </>
        ) : (
          <div role="status" className="empty-state" data-testid="time-no-instant">
            No instant resolved. Enter a Unix timestamp, ISO-8601 string, or date above (or check
            the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
