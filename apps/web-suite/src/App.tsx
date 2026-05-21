import { useState } from 'react';
import { envManifest } from '@nekotools/lens-env';
import { jsonManifest } from '@nekotools/lens-json';

import { EnvApp, type EnvAppProps } from './EnvApp.js';
import { JsonApp, type JsonAppProps } from './JsonApp.js';

export type { NekoJsonUiState, ViewMode } from './JsonApp.js';
export type { EnvViewMode, NekoEnvUiState } from './EnvApp.js';

export type ActiveTool = 'json' | 'env';

export interface AppProps extends JsonAppProps {
  /**
   * Which tool tab is mounted on first render. Defaults to `'json'` so
   * every Phase 1 App test continues to render the NekoJSON UI through
   * `<App>` unchanged.
   */
  readonly initialTool?: ActiveTool;
  /** Phase 2.2 — props forwarded to the NekoEnv sub-app. */
  readonly envApp?: EnvAppProps;
}

/**
 * Phase 2.2 web-suite shell.
 *
 * The shell hosts NekoJSON and NekoEnv as siblings; switching tabs
 * toggles which one is visible but **does not unmount the other**.
 * That preserves pasted text, view mode, active selection, search
 * query, and mask state across tab switches — a local-only dev tool
 * should never discard the user's pasted work behind their back.
 * The PR #14 audit blocker 1 fix replaced the conditional-render
 * pattern with `hidden`-toggled wrappers around both children.
 *
 * The props shape is backward-compatible with the Phase 1.1h `<App>`:
 * `initialInput`, `initialUiState`, and `clipboardDeps` are forwarded
 * to `JsonApp`, and the default `initialTool` is `'json'`. The
 * Phase 2.2 NekoEnv UI is reached via `initialTool: 'env'` and
 * `envApp: { ... }` for test seams.
 */
export function App({
  initialTool,
  envApp,
  ...jsonAppProps
}: AppProps = {}): JSX.Element {
  const [activeTool, setActiveTool] = useState<ActiveTool>(initialTool ?? 'json');

  const activeManifest = activeTool === 'json' ? jsonManifest : envManifest;

  return (
    <main className="suite">
      <header className="suite__header">
        <h1>NekoTools</h1>
        <p className="suite__tagline">
          Local-only, air-gapped-capable, zero-telemetry developer workbenches.
        </p>
        <p className="suite__phase">
          Web shell — Phase 2.2. Hosting <strong>{activeManifest.name}</strong>.
        </p>
        <nav className="suite__tools" aria-label="Tool selector">
          <button
            type="button"
            className={`suite__tool${activeTool === 'json' ? ' suite__tool--active' : ''}`}
            onClick={() => setActiveTool('json')}
            aria-pressed={activeTool === 'json'}
            data-testid="tool-tab-json"
          >
            NekoJSON
          </button>
          <button
            type="button"
            className={`suite__tool${activeTool === 'env' ? ' suite__tool--active' : ''}`}
            onClick={() => setActiveTool('env')}
            aria-pressed={activeTool === 'env'}
            data-testid="tool-tab-env"
          >
            NekoEnv
          </button>
        </nav>
      </header>

      {/*
        Both sub-apps stay mounted. The inactive one is `hidden` so
        screen readers + visual users see exactly one tool at a time,
        but React state — including the textarea contents — is
        preserved across tab toggles. PR #14 audit blocker 1.
      */}
      <div hidden={activeTool !== 'json'} data-testid="tool-panel-json">
        <JsonApp {...jsonAppProps} />
      </div>
      <div hidden={activeTool !== 'env'} data-testid="tool-panel-env">
        <EnvApp {...envApp} />
      </div>

      <footer className="suite__footer">
        <small>
          No telemetry. No analytics. No remote fetches. See{' '}
          <code>docs/product-doctrine.md</code> for the full rules.
        </small>
      </footer>
    </main>
  );
}
