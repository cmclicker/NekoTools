import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseCronInput } from './cron-parse.js';

/**
 * NekoCron sub-app. Wires `@nekotools/lens-cron` into the shared web-suite
 * shell as a UTILITY tool tab. Free surface: paste a cron expression, read
 * a plain-English description, see the next run times (UTC) and the
 * expanded field breakdown, and copy a JSON / markdown report. Pro (gated by
 * the suite license): export the next runs as an iCalendar (.ics) snapshot or
 * a Markdown timezone report. All local — NekoCron only explains expressions;
 * it never schedules anything.
 */

export type CronViewMode = 'overview' | 'json' | 'markdown' | 'ical' | 'timezone-report';

export interface NekoCronUiState {
  readonly viewMode: CronViewMode;
}

export interface CronAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoCronUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const PRO_VIEWS = new Set<CronViewMode>(['ical', 'timezone-report']);
const VIEW_MODES: readonly CronViewMode[] = ['overview', 'json', 'markdown', 'ical', 'timezone-report'];
const VIEW_LABELS: Record<CronViewMode, string> = {
  overview: 'Overview',
  json: 'JSON',
  markdown: 'Markdown',
  ical: 'iCalendar ⭐',
  'timezone-report': 'Timezone report ⭐',
};
const COPY_LABELS: Record<CronViewMode, string> = {
  overview: 'Copy markdown summary',
  json: 'Copy JSON',
  markdown: 'Copy markdown summary',
  ical: 'Copy iCalendar',
  'timezone-report': 'Copy timezone report',
};

const SAMPLE_INPUT = '*/15 9-17 * * 1-5';

export function CronApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: CronAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<CronViewMode>(initialUiState?.viewMode ?? 'overview');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseCronInput(input, effectiveEntitlement),
    [input, effectiveEntitlement],
  );
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);

  const proOutputText =
    viewMode === 'ical'
      ? parsed.ical
      : viewMode === 'timezone-report'
        ? parsed.timezoneReport
        : null;
  const copyText =
    viewMode === 'json'
      ? parsed.json
      : isProView
        ? (proOutputText ?? '')
        : parsed.markdown;

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [copyText, clipboardDeps]);

  return (
    <section className="tool tool--cron" aria-label="NekoCron workbench">
      <section className="paste card">
        <label htmlFor="cron-paste" className="paste__label">
          Paste a cron expression:
        </label>
        <textarea
          id="cron-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={2}
          data-testid="cron-input"
        />
        <p className="paste__hint">
          5-field, 6-field (with seconds), and @macros (@daily, @hourly, …) are supported. Next runs
          are computed in UTC, locally — nothing is scheduled or uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Cron output mode">
            <legend className="visually-hidden">Cron output mode</legend>
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="cronViewMode"
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
              data-testid="cron-copy-output"
            >
              {COPY_LABELS[viewMode]}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="cron-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        {parsed.valid ? (
          viewMode === 'overview' ? (
            <div data-testid="cron-overview">
              <p className="cron-description" data-testid="cron-description">
                {parsed.description}
              </p>

              {parsed.fields !== null ? (
                <dl className="url-fields" data-testid="cron-fields">
                  {parsed.fields.map((f) => (
                    <div className="url-field" key={f.name}>
                      <dt>{f.name}</dt>
                      <dd>
                        <code>{f.raw}</code> → {f.values.join(', ')}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              <h4 className="url-params__heading">Next runs (UTC)</h4>
              {parsed.nextRuns.length > 0 ? (
                <ul className="cron-next-runs" data-testid="cron-next-runs">
                  {parsed.nextRuns.map((r) => (
                    <li key={r}>
                      <code>{r}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state" data-testid="cron-no-runs">
                  No scheduled run times (e.g. @reboot).
                </p>
              )}
            </div>
          ) : isProView && !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="cron-locked">
              <strong>
                {viewMode === 'ical' ? 'iCalendar export' : 'Timezone report'} is a Pro feature.
              </strong>
              <p>
                Export the computed next runs as a ready-to-import iCalendar (<code>.ics</code>)
                snapshot, or a Markdown report rendering each UTC instant across major time zones.
                Unlock with a license key (verified locally, works offline forever).
              </p>
            </div>
          ) : isProView ? (
            <pre className="toml-output" data-testid="cron-output" aria-label={`${viewMode} output`}>
              {proOutputText}
            </pre>
          ) : (
            <pre className="toml-output" data-testid="cron-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json' ? parsed.json : parsed.markdown}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="cron-no-document">
            Not a valid cron expression yet — check the diagnostics below.
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
