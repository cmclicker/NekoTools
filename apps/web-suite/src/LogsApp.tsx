import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';
import type { LogFilter } from '@nekotools/lens-logs';

import { Diagnostics } from './Diagnostics.js';
import { FileLoadControl } from './FileLoadControl.js';
import { LogFilterControl, isEmptyFilter } from './LogFilterControl.js';
import { LogSummaryView } from './LogSummaryView.js';
import { LogTableView } from './LogTableView.js';
import { LogTextView } from './LogTextView.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { applyLogFilter, parseLogText } from './logs-parse.js';

/**
 * NekoLogs sub-app — Phase 2.x.2 UI. Wires `@nekotools/lens-logs` into
 * the shared web-suite shell as the third tool tab, mirroring NekoEnv's
 * structure: table / text / summary views, free-text search, a
 * structured-filter control that drives the engine's `log.filter`
 * parser, and copy.line / copy.message affordances.
 *
 * The structured filter is the engine-backed predicate. The search box
 * is a pure view narrowing layered on top of whatever the filter
 * produced — same split NekoEnv draws between its parser and its search.
 *
 * Pro (gated by the suite license): an incident report, a histogram SVG,
 * and message-pattern clusters. Each is a real engine exporter run via
 * logs-parse; a free caller gets the Pro-lock, same as NekoHex/NekoHeaders.
 */

export type LogViewMode = 'table' | 'text' | 'summary' | 'incident' | 'histogram' | 'clusters';

const PRO_VIEWS = new Set<LogViewMode>(['incident', 'histogram', 'clusters']);
const VIEW_MODES: readonly LogViewMode[] = [
  'table',
  'text',
  'summary',
  'incident',
  'histogram',
  'clusters',
];
const VIEW_LABELS: Record<LogViewMode, string> = {
  table: 'Table',
  text: 'Text',
  summary: 'Summary',
  incident: 'Incident ⭐',
  histogram: 'Histogram ⭐',
  clusters: 'Clusters ⭐',
};

export interface NekoLogsUiState {
  readonly viewMode: LogViewMode;
  readonly activeLine: number | null;
  readonly searchQuery: string;
  readonly filter: LogFilter;
}

export interface LogsAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoLogsUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly kind: 'line' | 'message';
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
  readonly reason?: string;
}

const DEFAULT_UI_STATE: NekoLogsUiState = {
  viewMode: 'table',
  activeLine: null,
  searchQuery: '',
  filter: {},
};

// Release-stable sample: mixed formats (JSON-per-line, logfmt,
// plaintext) so the table, summary, and histogram all have something
// to show. No PR numbers / test counts / fast-drifting values.
const SAMPLE_INPUT = `{"time":"2026-05-21T10:00:00Z","level":"info","msg":"service started","svc":"api"}
2026-05-21 10:00:05 [WARN] cache miss for user 4821
level=error msg="upstream timeout" svc=api status=503
2026-05-21 10:00:30 [INFO] request completed
a bare line with no structure at all`;

export function LogsApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: LogsAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<LogViewMode>(
    initialUiState?.viewMode ?? DEFAULT_UI_STATE.viewMode,
  );
  const [activeLine, setActiveLine] = useState<number | null>(
    initialUiState?.activeLine ?? DEFAULT_UI_STATE.activeLine,
  );
  const [searchQuery, setSearchQuery] = useState<string>(
    initialUiState?.searchQuery ?? DEFAULT_UI_STATE.searchQuery,
  );
  const [filter, setFilter] = useState<LogFilter>(
    initialUiState?.filter ?? DEFAULT_UI_STATE.filter,
  );
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseLogText(input, effectiveEntitlement),
    [input, effectiveEntitlement],
  );
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);
  const proOutputText =
    viewMode === 'incident'
      ? parsed.incidentReport
      : viewMode === 'histogram'
        ? parsed.histogramSvg
        : viewMode === 'clusters'
          ? parsed.patternsClusters
          : null;

  const filterActive = !isEmptyFilter(filter);

  // Run the engine filter only when there is a document AND at least
  // one predicate. An all-empty filter is match-all; skipping the run
  // avoids a needless artifact and keeps the table on document.entries.
  const filtered = useMemo(() => {
    if (!filterActive || parsed.document === null || parsed.documentArtifactId === null) {
      return null;
    }
    return applyLogFilter(parsed.document, parsed.documentArtifactId, filter);
  }, [filterActive, parsed.document, parsed.documentArtifactId, filter]);

  // The entries the table renders: the filter result when a (valid)
  // filter is active, else the full document. A filter that fails to
  // validate yields no result artifact — fall back to the document so
  // the table still shows something while the diagnostic explains why.
  const tableEntries = useMemo(() => {
    if (filtered?.result) return filtered.result.entries;
    return parsed.document?.entries ?? [];
  }, [filtered, parsed.document]);

  const activeEntry = useMemo(() => {
    if (parsed.document === null || activeLine === null) return null;
    return parsed.document.entries.find((e) => e.lineNumber === activeLine) ?? null;
  }, [parsed.document, activeLine]);

  const allDiagnostics = useMemo(
    () => (filtered ? [...parsed.diagnostics, ...filtered.diagnostics] : parsed.diagnostics),
    [parsed.diagnostics, filtered],
  );

  const handleCopyLine = useCallback(async () => {
    if (activeEntry === null) {
      setCopyStatus({ kind: 'line', ok: false, method: 'none', reason: 'no line selected' });
      return;
    }
    const result = await copyToClipboard(activeEntry.raw, clipboardDeps);
    setCopyStatus({
      kind: 'line',
      ok: result.ok,
      method: result.method,
      ...(result.reason !== undefined && { reason: result.reason }),
    });
  }, [activeEntry, clipboardDeps]);

  const handleCopyMessage = useCallback(async () => {
    if (activeEntry === null) {
      setCopyStatus({ kind: 'message', ok: false, method: 'none', reason: 'no line selected' });
      return;
    }
    const result = await copyToClipboard(activeEntry.message, clipboardDeps);
    setCopyStatus({
      kind: 'message',
      ok: result.ok,
      method: result.method,
      ...(result.reason !== undefined && { reason: result.reason }),
    });
  }, [activeEntry, clipboardDeps]);

  const copyDisabled = activeEntry === null;
  const matchedCount = filtered?.result?.matchedCount ?? null;
  const totalCount = filtered?.result?.totalCount ?? null;

  return (
    <section className="tool tool--logs" aria-label="NekoLogs workbench">
      <section className="paste card">
        <label htmlFor="logs-paste" className="paste__label">
          Paste a log snapshot here:
        </label>
        <FileLoadControl
          onText={(text) => setInput(text)}
          testId="logs-file"
          label="…or load a .log file"
          ariaLabel="Load a local log file"
        />
        <textarea
          id="logs-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={6}
          data-testid="logs-input"
        />
        <p className="paste__hint">
          Parsing runs entirely in your browser. No live tailing, no
          remote ingestion, no network.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Logs view mode">
            <legend className="visually-hidden">Logs view mode</legend>
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="logsViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {VIEW_LABELS[m]}
              </label>
            ))}
          </fieldset>

          <label className="search">
            <span className="visually-hidden">Search messages, levels, and fields</span>
            <input
              type="search"
              placeholder="Search messages / fields…"
              value={searchQuery}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              data-testid="logs-search-input"
            />
          </label>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopyLine}
              disabled={copyDisabled}
              data-testid="logs-copy-line"
            >
              Copy line
            </button>
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopyMessage}
              disabled={copyDisabled}
              data-testid="logs-copy-message"
            >
              Copy message
            </button>
          </div>

          {activeEntry !== null ? (
            <p className="results__path" data-testid="logs-active-line">
              Active line: <code>{activeEntry.lineNumber}</code> · message:{' '}
              <code data-testid="logs-active-message">
                {activeEntry.message || '(empty)'}
              </code>
            </p>
          ) : (
            <p className="results__path" data-testid="logs-active-line">
              No line selected.
            </p>
          )}

          {filterActive && matchedCount !== null && totalCount !== null ? (
            <p className="results__filter-count" data-testid="logs-matched-count">
              Filter matched <strong>{matchedCount}</strong> of {totalCount} entries.
            </p>
          ) : null}

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="logs-copy-status"
              data-kind={copyStatus.kind}
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied ${copyStatus.kind} to clipboard (via ${copyStatus.method}).`
                : `Copy ${copyStatus.kind} failed${copyStatus.reason ? `: ${copyStatus.reason}` : ''}.`}
            </p>
          ) : null}
        </div>

        {!isProView && (viewMode === 'table' || viewMode === 'summary') ? (
          <LogFilterControl filter={filter} onFilterChange={setFilter} />
        ) : null}

        {isProView ? (
          !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="logs-locked">
              <strong>
                {viewMode === 'incident'
                  ? 'Incident report'
                  : viewMode === 'histogram'
                    ? 'Histogram SVG'
                    : 'Message clusters'}{' '}
                is a Pro feature.
              </strong>
              <p>
                Turn this snapshot into a shareable markdown incident report (severity, level
                breakdown, time range), a stacked-bar histogram SVG, or message-pattern clusters
                that collapse repeated lines into templates. Unlock with a license key (verified
                locally, works offline forever).
              </p>
            </div>
          ) : (
            <pre
              className="yaml-output"
              data-testid="logs-pro-output"
              aria-label={`${viewMode} output`}
            >
              {proOutputText}
            </pre>
          )
        ) : viewMode === 'table' ? (
          parsed.document !== null ? (
            <LogTableView
              entries={tableEntries}
              searchQuery={searchQuery}
              activeLine={activeLine}
              onSelectLine={setActiveLine}
            />
          ) : (
            <div role="status" className="empty-state" data-testid="logs-no-document">
              No log document yet. Paste a snapshot above or switch to the
              Text view to inspect the raw input.
            </div>
          )
        ) : viewMode === 'text' ? (
          <LogTextView text={input} diagnostics={parsed.diagnostics} />
        ) : parsed.summary !== null && parsed.histogram !== null ? (
          <LogSummaryView summary={parsed.summary} histogram={parsed.histogram} />
        ) : (
          <div role="status" className="empty-state" data-testid="logs-no-summary">
            No summary yet. Paste a log snapshot above.
          </div>
        )}

        <Diagnostics diagnostics={allDiagnostics} />
      </section>
    </section>
  );
}
