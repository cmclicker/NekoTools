import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { FileLoadControl } from './FileLoadControl.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { runCsv, type CsvDelimiter } from './csv-parse.js';

/**
 * NekoCSV sub-app. Wires `@nekotools/lens-csv` into the shared web-suite
 * shell. Free: paste CSV/TSV, see counts + the parsed table, copy the JSON /
 * Markdown / normalized-CSV exports. Pro (gated by the suite license): a
 * structural column profile, an inferred JSON Schema, and a JSON cleaning
 * recipe. All local — nothing is uploaded.
 */

export type CsvViewMode = 'table' | 'profile' | 'schema' | 'cleaning';

export interface NekoCsvUiState {
  readonly delimiter: CsvDelimiter;
  readonly hasHeader: boolean;
  readonly viewMode: CsvViewMode;
}

export interface CsvAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoCsvUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

type CopyTarget = 'json' | 'markdown' | 'csv';

const PRO_VIEWS = new Set<CsvViewMode>(['profile', 'schema', 'cleaning']);
const VIEW_MODES: readonly CsvViewMode[] = ['table', 'profile', 'schema', 'cleaning'];
const VIEW_LABELS: Record<CsvViewMode, string> = {
  table: 'Table',
  profile: 'Column profile ⭐',
  schema: 'JSON Schema ⭐',
  cleaning: 'Cleaning recipe ⭐',
};

interface CopyStatus {
  readonly ok: boolean;
  readonly target: CopyTarget;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = `name,role,language
Ada Lovelace,mathematician,Analytical Engine
Grace Hopper,computer scientist,COBOL
"Ken Thompson","systems programmer","B, C, Go"`;

const DELIMITERS: ReadonlyArray<{ readonly id: CsvDelimiter; readonly label: string }> = [
  { id: 'comma', label: 'CSV' },
  { id: 'tab', label: 'TSV' },
];

export function CsvApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: CsvAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(initialUiState?.delimiter ?? 'comma');
  const [hasHeader, setHasHeader] = useState<boolean>(initialUiState?.hasHeader ?? true);
  const [viewMode, setViewMode] = useState<CsvViewMode>(initialUiState?.viewMode ?? 'table');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const run = useMemo(
    () => runCsv(input, delimiter, hasHeader, effectiveEntitlement),
    [input, delimiter, hasHeader, effectiveEntitlement],
  );
  const table = run.table;
  const proUnlocked = run.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);
  const proOutput =
    viewMode === 'profile'
      ? run.profileReport
      : viewMode === 'schema'
        ? run.schemaJson
        : viewMode === 'cleaning'
          ? run.cleaningRecipe
          : null;

  const handleCopy = useCallback(
    async (target: CopyTarget) => {
      const text =
        target === 'json'
          ? run.jsonSummary
          : target === 'markdown'
            ? run.markdownSummary
            : run.normalizedCsv;
      if (text === null) {
        setCopyStatus({ ok: false, target, method: 'none' });
        return;
      }
      const result = await copyToClipboard(text, clipboardDeps);
      setCopyStatus({ ok: result.ok, target, method: result.method });
    },
    [clipboardDeps, run.jsonSummary, run.markdownSummary, run.normalizedCsv],
  );

  return (
    <section className="tool tool--csv" aria-label="NekoCSV workbench">
      <section className="paste card">
        <label htmlFor="csv-paste" className="paste__label">
          Paste CSV or TSV:
        </label>
        <FileLoadControl
          onText={(text) => setInput(text)}
          testId="csv-file"
          label="…or load a .csv / .tsv file"
          ariaLabel="Load a local CSV or TSV file"
        />
        <textarea
          id="csv-paste"
          className="paste__textarea"
          value={input}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setInput(event.target.value)}
          spellCheck={false}
          rows={9}
          data-testid="csv-input"
        />
        <p className="paste__hint">
          Parsing runs locally in your browser. No uploads, remote fetches, or telemetry.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Delimiter">
            <legend className="visually-hidden">Delimiter</legend>
            {DELIMITERS.map((item) => (
              <label key={item.id} className={delimiter === item.id ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="csvDelimiter"
                  value={item.id}
                  checked={delimiter === item.id}
                  onChange={() => setDelimiter(item.id)}
                  data-testid={`csv-delimiter-${item.id}`}
                />
                {item.label}
              </label>
            ))}
          </fieldset>

          <label className={hasHeader ? 'csv-header csv-header--active' : 'csv-header'}>
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(event) => setHasHeader(event.currentTarget.checked)}
              data-testid="csv-has-header"
            />
            Header row
          </label>

          <fieldset className="viewmode" aria-label="CSV view mode">
            <legend className="visually-hidden">CSV view mode</legend>
            {VIEW_MODES.map((mode) => (
              <label key={mode} className={viewMode === mode ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="csvViewMode"
                  value={mode}
                  checked={viewMode === mode}
                  onChange={() => setViewMode(mode)}
                  data-testid={`csv-view-${mode}`}
                />
                {VIEW_LABELS[mode]}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={() => void handleCopy('json')}
              disabled={run.jsonSummary === null}
              data-testid="csv-copy-json"
            >
              Copy JSON
            </button>
            <button
              type="button"
              className="copy__btn"
              onClick={() => void handleCopy('markdown')}
              disabled={run.markdownSummary === null}
              data-testid="csv-copy-markdown"
            >
              Copy Markdown
            </button>
            <button
              type="button"
              className="copy__btn"
              onClick={() => void handleCopy('csv')}
              disabled={run.normalizedCsv === null}
              data-testid="csv-copy-normalized"
            >
              Copy CSV
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="csv-copy-status"
              data-target={copyStatus.target}
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied ${copyStatus.target} export to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy yet.'}
            </p>
          ) : null}
        </div>

        {table === null ? (
          <div role="status" className="empty-state" data-testid="csv-no-table">
            No table parsed. Check diagnostics below.
          </div>
        ) : isProView ? (
          !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="csv-locked">
              <strong>
                {viewMode === 'profile'
                  ? 'Column profile'
                  : viewMode === 'schema'
                    ? 'JSON Schema inference'
                    : 'Cleaning recipe'}{' '}
                is a Pro feature.
              </strong>
              <p>
                Generate a structural per-column profile, infer a JSON Schema for one row, and get a
                declarative JSON cleaning recipe straight from this table. Unlock with a license key
                (verified locally, works offline forever).
              </p>
            </div>
          ) : (
            <pre className="toml-output csv-output" data-testid="csv-output" aria-label={`${viewMode} output`}>
              {proOutput}
            </pre>
          )
        ) : (
          <>
            <dl className="csv-counts" data-testid="csv-counts">
              <dt>Rows</dt>
              <dd>{table.rowCount}</dd>
              <dt>Columns</dt>
              <dd>{table.columnCount}</dd>
              <dt>Empty cells</dt>
              <dd>{table.emptyCellCount}</dd>
              <dt>Input bytes</dt>
              <dd>{run.inputBytes}</dd>
            </dl>

            {table.columns.length > 0 ? (
              <div className="env-table csv-table" data-testid="csv-table">
                <table>
                  <thead>
                    <tr>
                      <th>Line</th>
                      {table.columns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, index) => (
                      <tr key={`${row.line}:${index}`}>
                        <td>{row.line}</td>
                        {table.columns.map((column, columnIndex) => (
                          <td key={column} className="csv-cell">
                            {row.cells[columnIndex] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="csv-empty" data-testid="csv-empty">
                No rows to display.
              </p>
            )}
          </>
        )}

        <Diagnostics diagnostics={run.diagnostics} />
      </section>
    </section>
  );
}
