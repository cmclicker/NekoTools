import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { ToolRegistry } from '@nekotools/tool-runtime';
import {
  buildJsonRegistration,
  FIXED_CLOCK,
  jsonManifest,
} from '@nekotools/lens-json';

import { Diagnostics } from './Diagnostics.js';
import { TreeView } from './TreeView.js';
import { TextView } from './TextView.js';
import { TableView } from './TableView.js';
import { parseInput } from './parse-input.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { resolveJsonPointer } from './pointer-resolve.js';

/**
 * Phase 1.1h web-suite App.
 *
 * The user pastes JSON; the lens-json parser runs through the
 * tool-runtime registry; the result renders in one of three views
 * (tree, text, table). Active-path selection in the tree is exposed
 * via `uiState.activePath` (a `string | null` — `null` means
 * nothing is selected; `""` is the legitimate RFC 6901 root pointer).
 * `uiState.viewMode` mirrors the toggle. `uiState.searchQuery` filters
 * tree and table rows.
 *
 * Phase 1.1h adds local copy.path / copy.value affordances backed by
 * `clipboard.ts` and `pointer-resolve.ts`. With this PR, Phase 1's
 * free tier is fully shipped — every charter-declared free feature
 * is implementation-backed in `manifest.entitlements.free`.
 *
 * Workspace save/load to disk is NOT in 1.1h scope — the `uiState`
 * shape lives in component state, and the workspace serializer's
 * round-trip is exercised by tests in the conformance suite.
 */

export type ViewMode = 'tree' | 'text' | 'table';

export interface NekoJsonUiState {
  readonly viewMode: ViewMode;
  /**
   * The currently selected JSON Pointer, or `null` when nothing is
   * selected. The empty string `""` is **not** the no-selection
   * sentinel — it is the RFC 6901 root pointer, and selecting the
   * root row of the tree must be observable. PR #11 audit blocker
   * 1: previously `""` was overloaded for both meanings, which made
   * Copy path / Copy value on the root impossible.
   */
  readonly activePath: string | null;
  readonly searchQuery: string;
}

interface AppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoJsonUiState>;
  /**
   * Phase 1.1h — test seam. Lets unit tests inject in-memory copy
   * implementations instead of relying on jsdom's lack of
   * `navigator.clipboard` / `document.execCommand`. Defaults to the
   * production helper's auto-detected paths.
   */
  readonly clipboardDeps?: ClipboardDeps;
}

/**
 * Discriminated state for the "Copied!" status pill in the toolbar.
 * `kind` mirrors the button the user pressed; `method` tells the
 * status text whether the Clipboard API or the DOM fallback won.
 */
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

// The sample is intentionally release-stable: no test counts, no PR
// numbers, no other fast-drifting values. Those are a liability in a
// demo input — they go stale the next time we ship.
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

export function App({
  initialInput,
  initialUiState,
  clipboardDeps,
}: AppProps = {}): JSX.Element {
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

  // null = nothing selected. `''` (the RFC 6901 root pointer) is a
  // legitimate selection and must keep the buttons enabled.
  const copyPathDisabled = activePath === null;
  const copyValueDisabled = activePath === null || !parsed.hasDocument;

  return (
    <main className="suite">
      <header className="suite__header">
        <h1>NekoTools</h1>
        <p className="suite__tagline">
          Local-only, air-gapped-capable, zero-telemetry developer workbenches.
        </p>
        <p className="suite__phase">
          Web shell — Phase 1.1h. Hosting <strong>{jsonManifest.name}</strong>{' '}
          (tree, text, and table views with search and local clipboard copy).
        </p>
      </header>

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

      <footer className="suite__footer">
        <small>
          No telemetry. No analytics. No remote fetches. See{' '}
          <code>docs/product-doctrine.md</code> for the full rules.
        </small>
      </footer>
    </main>
  );
}
