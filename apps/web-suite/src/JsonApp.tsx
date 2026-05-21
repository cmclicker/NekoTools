import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { ToolRegistry } from '@nekotools/tool-runtime';
import { buildJsonRegistration, FIXED_CLOCK } from '@nekotools/lens-json';

import { Diagnostics } from './Diagnostics.js';
import { TreeView } from './TreeView.js';
import { TextView } from './TextView.js';
import { TableView } from './TableView.js';
import { parseInput } from './parse-input.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { resolveJsonPointer } from './pointer-resolve.js';

/**
 * NekoJSON sub-app — the original Phase 1.1h App body, lifted into
 * its own component so the Phase 2.2 shell (`App.tsx`) can host
 * NekoEnv alongside it via a tool-switcher tab. The behavior is
 * unchanged; the existing 25 App.test.tsx tests continue to render
 * `<App>` and exercise this component (App defaults to the json
 * tab).
 */

export type ViewMode = 'tree' | 'text' | 'table';

export interface NekoJsonUiState {
  readonly viewMode: ViewMode;
  /**
   * The currently selected JSON Pointer, or `null` when nothing is
   * selected. `""` is **not** the no-selection sentinel — it is the
   * RFC 6901 root pointer (PR #11 audit blocker 1).
   */
  readonly activePath: string | null;
  readonly searchQuery: string;
}

export interface JsonAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoJsonUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly kind: 'path' | 'value';
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
  readonly reason?: string;
}

const DEFAULT_UI_STATE: NekoJsonUiState = {
  viewMode: 'tree',
  activePath: null,
  searchQuery: '',
};

// Release-stable sample: no test counts, no PR numbers, no fast-
// drifting values. Same reasoning as the Phase 1.1g sample.
const SAMPLE_INPUT = `{
  "tool": "NekoJSON",
  "doctrine": "local-only",
  "views": ["tree", "text", "table"],
  "diagnostics": {
    "kinds": ["error", "warning", "info"],
    "examples": null
  }
}`;

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildJsonRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export function JsonApp({
  initialInput,
  initialUiState,
  clipboardDeps,
}: JsonAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<ViewMode>(
    initialUiState?.viewMode ?? DEFAULT_UI_STATE.viewMode,
  );
  const [activePath, setActivePath] = useState<string | null>(
    initialUiState?.activePath ?? DEFAULT_UI_STATE.activePath,
  );
  const [searchQuery, setSearchQuery] = useState<string>(
    initialUiState?.searchQuery ?? DEFAULT_UI_STATE.searchQuery,
  );
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseInput(registry, input), [input]);

  const handleCopyPath = useCallback(async () => {
    if (activePath === null) return;
    const result = await copyToClipboard(activePath, clipboardDeps);
    setCopyStatus({
      kind: 'path',
      ok: result.ok,
      method: result.method,
      ...(result.reason !== undefined && { reason: result.reason }),
    });
  }, [activePath, clipboardDeps]);

  const handleCopyValue = useCallback(async () => {
    if (activePath === null || !parsed.hasDocument) return;
    const resolved = resolveJsonPointer(parsed.value, activePath);
    const text = resolved.ok ? JSON.stringify(resolved.value, null, 2) : '';
    if (!resolved.ok) {
      setCopyStatus({
        kind: 'value',
        ok: false,
        method: 'none',
        reason: resolved.reason,
      });
      return;
    }
    const result = await copyToClipboard(text, clipboardDeps);
    setCopyStatus({
      kind: 'value',
      ok: result.ok,
      method: result.method,
      ...(result.reason !== undefined && { reason: result.reason }),
    });
  }, [parsed.hasDocument, parsed.value, activePath, clipboardDeps]);

  const copyPathDisabled = activePath === null;
  const copyValueDisabled = activePath === null || !parsed.hasDocument;

  return (
    <section className="tool tool--json" aria-label="NekoJSON workbench">
      <section className="paste card">
        <label htmlFor="paste-textarea" className="paste__label">
          Paste JSON here:
        </label>
        <textarea
          id="paste-textarea"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={6}
        />
        <p className="paste__hint">
          Parsing runs entirely in your browser. No network, no upload, no analytics.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="View mode">
            <legend className="visually-hidden">View mode</legend>
            <label className={viewMode === 'tree' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="viewMode"
                value="tree"
                checked={viewMode === 'tree'}
                onChange={() => setViewMode('tree')}
              />
              Tree
            </label>
            <label className={viewMode === 'text' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="viewMode"
                value="text"
                checked={viewMode === 'text'}
                onChange={() => setViewMode('text')}
              />
              Text
            </label>
            <label className={viewMode === 'table' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="viewMode"
                value="table"
                checked={viewMode === 'table'}
                onChange={() => setViewMode('table')}
              />
              Table
            </label>
          </fieldset>

          <label className="search">
            <span className="visually-hidden">Search keys and values</span>
            <input
              type="search"
              placeholder="Search keys / values…"
              value={searchQuery}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              data-testid="search-input"
            />
          </label>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopyPath}
              disabled={copyPathDisabled}
              data-testid="copy-path"
            >
              Copy path
            </button>
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopyValue}
              disabled={copyValueDisabled}
              data-testid="copy-value"
            >
              Copy value
            </button>
          </div>

          {activePath !== null ? (
            <p className="results__path" data-testid="active-path">
              Active path: <code>{activePath === '' ? '(root)' : activePath}</code>
            </p>
          ) : (
            <p className="results__path" data-testid="active-path">
              No path selected.
            </p>
          )}

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="copy-status"
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

        {viewMode === 'tree' ? (
          parsed.hasDocument ? (
            <TreeView
              value={parsed.value}
              activePath={activePath}
              onSelectPath={setActivePath}
              searchQuery={searchQuery}
            />
          ) : (
            <div role="status" className="empty-state" data-testid="no-document">
              No valid JSON document yet. Fix the diagnostics below or
              switch to the Text view to inspect the raw input.
            </div>
          )
        ) : viewMode === 'table' ? (
          parsed.hasDocument ? (
            <TableView value={parsed.value} searchQuery={searchQuery} />
          ) : (
            <div role="status" className="empty-state" data-testid="no-document">
              No valid JSON document yet. Fix the diagnostics below or
              switch to the Text view to inspect the raw input.
            </div>
          )
        ) : (
          <TextView text={input} diagnostics={parsed.diagnostics} />
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
