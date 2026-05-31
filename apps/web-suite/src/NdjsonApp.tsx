import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { FileLoadControl } from './FileLoadControl.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseNdjsonInput } from './ndjson-parse.js';

/**
 * NekoNDJSON sub-app. Wires `@nekotools/lens-ndjson` into the shared
 * web-suite shell as a DATA tool tab. Free surface: paste NDJSON, see each
 * record (valid/invalid per line) and the inferred shape, convert to a JSON
 * array / normalized NDJSON, and copy. One bad line never sinks the rest.
 * Pro (gated by the suite license): export an inferred JSON Schema or a
 * flattened CSV grid. All local.
 */

export type NdjsonViewMode = 'records' | 'shape' | 'json' | 'ndjson' | 'markdown' | 'schema' | 'csv';

export interface NekoNdjsonUiState {
  readonly viewMode: NdjsonViewMode;
}

export interface NdjsonAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoNdjsonUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = [
  '{"id": 1, "name": "alpha", "active": true}',
  '{"id": 2, "name": "beta"}',
  '{"id": 3, "name": "gamma", "active": false, "score": 9.5}',
].join('\n');

const PRO_VIEWS = new Set<NdjsonViewMode>(['schema', 'csv']);
const VIEW_MODES: readonly NdjsonViewMode[] = [
  'records',
  'shape',
  'json',
  'ndjson',
  'markdown',
  'schema',
  'csv',
];
const VIEW_LABELS: Record<NdjsonViewMode, string> = {
  records: 'Records',
  shape: 'Shape',
  json: 'JSON array',
  ndjson: 'NDJSON',
  markdown: 'Markdown',
  schema: 'JSON Schema ⭐',
  csv: 'CSV ⭐',
};
const COPY_LABELS: Record<NdjsonViewMode, string> = {
  records: 'Copy records',
  shape: 'Copy shape',
  json: 'Copy JSON array',
  ndjson: 'Copy NDJSON',
  markdown: 'Copy markdown summary',
  schema: 'Copy JSON Schema',
  csv: 'Copy CSV',
};

function previewValue(value: unknown): string {
  const s = JSON.stringify(value);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

export function NdjsonApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: NdjsonAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<NdjsonViewMode>(initialUiState?.viewMode ?? 'records');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseNdjsonInput(input, effectiveEntitlement),
    [input, effectiveEntitlement],
  );
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);

  // Text outputs (rendered in <pre>); structured views (records/shape) have none.
  // Pro outputs are null when the caller isn't entitled, which disables copy.
  const outputText =
    viewMode === 'json'
      ? parsed.json
      : viewMode === 'ndjson'
        ? parsed.ndjson
        : viewMode === 'markdown'
          ? parsed.markdown
          : viewMode === 'schema'
            ? parsed.schemaJson
            : viewMode === 'csv'
              ? parsed.csv
              : null;
  const copyText = outputText ?? '';
  const copyDisabled = (viewMode === 'records' || viewMode === 'shape') ? parsed.count === 0 : copyText === '';

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [copyText, clipboardDeps]);

  return (
    <section className="tool tool--ndjson" aria-label="NekoNDJSON workbench">
      <section className="paste card">
        <label htmlFor="ndjson-paste" className="paste__label">
          Paste NDJSON (one JSON value per line):
        </label>
        <FileLoadControl
          onText={(text) => setInput(text)}
          testId="ndjson-file"
          label="…or load a .ndjson / .jsonl file"
          ariaLabel="Load a local NDJSON file"
        />
        <textarea
          id="ndjson-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={8}
          data-testid="ndjson-input"
        />
        <p className="paste__hint">
          Parsing runs entirely in your browser. Each line is parsed independently — one bad line
          never sinks the rest. Nothing uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="NDJSON output mode">
            <legend className="visually-hidden">NDJSON output mode</legend>
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="ndjsonViewMode"
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
              data-testid="ndjson-copy-output"
            >
              {COPY_LABELS[viewMode]}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="ndjson-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="ndjson-stats">
          <li>
            records: <strong data-testid="ndjson-stat-count">{parsed.count}</strong>
          </li>
          <li>
            valid: <strong data-testid="ndjson-stat-valid">{parsed.validCount}</strong>
          </li>
          <li>
            invalid: <strong data-testid="ndjson-stat-invalid">{parsed.invalidCount}</strong>
          </li>
        </ul>

        {parsed.count > 0 ? (
          viewMode === 'records' ? (
            <table className="url-params" data-testid="ndjson-records">
              <thead>
                <tr>
                  <th scope="col">line</th>
                  <th scope="col">valid</th>
                  <th scope="col">type</th>
                  <th scope="col">value / error</th>
                </tr>
              </thead>
              <tbody>
                {parsed.records.map((r) => (
                  <tr key={r.line} data-valid={r.valid}>
                    <td>{r.line}</td>
                    <td>{r.valid ? 'yes' : 'no'}</td>
                    <td>{r.type ?? '—'}</td>
                    <td>{r.valid ? previewValue(r.value) : r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : viewMode === 'shape' ? (
            parsed.fields.length > 0 ? (
              <table className="url-params" data-testid="ndjson-shape">
                <thead>
                  <tr>
                    <th scope="col">key</th>
                    <th scope="col">types</th>
                    <th scope="col">optional</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.fields.map((f) => (
                    <tr key={f.key}>
                      <td>{f.key}</td>
                      <td>{f.types.join(', ')}</td>
                      <td>{f.optional ? 'yes' : 'no'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-state" data-testid="ndjson-no-shape">
                No shape inferred — records are not all JSON objects.
              </p>
            )
          ) : isProView && !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="ndjson-locked">
              <strong>{viewMode === 'schema' ? 'JSON Schema export' : 'CSV export'} is a Pro feature.</strong>
              <p>
                Infer a JSON Schema from your records or flatten the valid object records into a CSV
                grid. Unlock with a license key (verified locally, works offline forever).
              </p>
            </div>
          ) : (
            <pre className="toml-output" data-testid="ndjson-output" aria-label={`${viewMode} output`}>
              {outputText}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="ndjson-no-document">
            No records yet. Paste NDJSON above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
