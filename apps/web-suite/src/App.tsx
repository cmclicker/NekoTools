import { useMemo, useState, type ChangeEvent } from 'react';
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

/**
 * Phase 1.1g web-suite App.
 *
 * The user pastes JSON; the lens-json parser runs through the
 * tool-runtime registry; the result renders in one of three views
 * (tree, text, table). Active-path selection in the tree is exposed
 * via `uiState.activePath`. `uiState.viewMode` mirrors the toggle.
 * `uiState.searchQuery` filters tree and table rows.
 *
 * Workspace save/load to disk is NOT in 1.1g scope — the `uiState`
 * shape lives in component state, and the workspace serializer's
 * round-trip is exercised by tests in the conformance suite.
 */

export type ViewMode = 'tree' | 'text' | 'table';

export interface NekoJsonUiState {
  readonly viewMode: ViewMode;
  readonly activePath: string;
  readonly searchQuery: string;
}

interface AppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoJsonUiState>;
}

const DEFAULT_UI_STATE: NekoJsonUiState = {
  viewMode: 'tree',
  activePath: '',
  searchQuery: '',
};

const SAMPLE_INPUT = `{
  "tool": "NekoJSON",
  "phase": "1.1g",
  "features": ["tree view", "text view", "table view", "search"],
  "stats": { "tests": 252, "packages": 8 }
}`;

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildJsonRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export function App({ initialInput, initialUiState }: AppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<ViewMode>(
    initialUiState?.viewMode ?? DEFAULT_UI_STATE.viewMode,
  );
  const [activePath, setActivePath] = useState<string>(
    initialUiState?.activePath ?? DEFAULT_UI_STATE.activePath,
  );
  const [searchQuery, setSearchQuery] = useState<string>(
    initialUiState?.searchQuery ?? DEFAULT_UI_STATE.searchQuery,
  );

  const parsed = useMemo(() => parseInput(registry, input), [input]);

  return (
    <main className="suite">
      <header className="suite__header">
        <h1>NekoTools</h1>
        <p className="suite__tagline">
          Local-only, air-gapped-capable, zero-telemetry developer workbenches.
        </p>
        <p className="suite__phase">
          Web shell — Phase 1.1g. Hosting <strong>{jsonManifest.name}</strong>{' '}
          (tree, text, and table views with search; copy affordances are queued for 1.1h).
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

          {activePath ? (
            <p className="results__path" data-testid="active-path">
              Active path: <code>{activePath}</code>
            </p>
          ) : (
            <p className="results__path" data-testid="active-path">
              No path selected.
            </p>
          )}
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
