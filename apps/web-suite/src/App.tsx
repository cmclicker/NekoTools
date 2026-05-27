import { useState } from 'react';

import { EnvApp, type EnvAppProps } from './EnvApp.js';
import { JsonApp, type JsonAppProps } from './JsonApp.js';
import { LogsApp, type LogsAppProps } from './LogsApp.js';
import { ProSurface } from './ProSurface.js';
import { TOOLS, toolById, type ActiveTool } from './tools.js';

export type { NekoJsonUiState, ViewMode } from './JsonApp.js';
export type { EnvViewMode, NekoEnvUiState } from './EnvApp.js';
export type { LogViewMode, NekoLogsUiState } from './LogsApp.js';
export type { ActiveTool } from './tools.js';

export interface AppProps extends JsonAppProps {
  /**
   * Which tool tab is mounted on first render. Defaults to `'json'` so
   * every Phase 1 App test continues to render the NekoJSON UI through
   * `<App>` unchanged.
   */
  readonly initialTool?: ActiveTool;
  /** Phase 2.2 — props forwarded to the NekoEnv sub-app. */
  readonly envApp?: EnvAppProps;
  /** Phase 2.x.2 — props forwarded to the NekoLogs sub-app. */
  readonly logsApp?: LogsAppProps;
}

/**
 * Unified web-suite shell.
 *
 * The tab strip and the Free / Pro entitlement surface (`ProSurface`)
 * are rendered from the `TOOLS` registry (`tools.ts`), so adding a tool
 * to those surfaces is a one-line registration. Each tool still mounts
 * its own panel below; switching tabs toggles which panel is visible but
 * **does not unmount the others** (`hidden`-toggled wrappers), so pasted
 * text, view mode, selection, search, and filter survive tab switches —
 * a local-only dev tool should never discard the user's work behind
 * their back (PR #14 audit blocker 1). New tools add a `TOOLS` entry
 * plus a panel here.
 *
 * The props shape stays backward-compatible with the Phase 1.1h `<App>`:
 * `initialInput`, `initialUiState`, and `clipboardDeps` are forwarded to
 * `JsonApp`, and the default `initialTool` is `'json'`.
 */
export function App({
  initialTool,
  envApp,
  logsApp,
  ...jsonAppProps
}: AppProps = {}): JSX.Element {
  const [activeTool, setActiveTool] = useState<ActiveTool>(initialTool ?? 'json');

  const activeManifest = toolById(activeTool).manifest;

  return (
    <main className="suite">
      <header className="suite__header">
        <h1>NekoTools</h1>
        <p className="suite__tagline">
          Local-only, air-gapped-capable, zero-telemetry developer workbenches.
        </p>
        <p className="suite__phase">
          Now viewing <strong>{activeManifest.name}</strong>.
        </p>
        <nav className="suite__tools" aria-label="Tool selector">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className={`suite__tool${activeTool === tool.id ? ' suite__tool--active' : ''}`}
              onClick={() => setActiveTool(tool.id)}
              aria-pressed={activeTool === tool.id}
              data-testid={`tool-tab-${tool.id}`}
            >
              {tool.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Free / Pro surface for the active tool — visible monetization
          boundary, consistent across every tool. Presentation only. */}
      <ProSurface manifest={activeManifest} />

      {/*
        All sub-apps stay mounted. The inactive ones are `hidden` so
        screen readers + visual users see exactly one tool at a time,
        but React state — including the textarea contents — is preserved
        across tab toggles. PR #14 audit blocker 1.
      */}
      <div hidden={activeTool !== 'json'} data-testid="tool-panel-json">
        <JsonApp {...jsonAppProps} />
      </div>
      <div hidden={activeTool !== 'env'} data-testid="tool-panel-env">
        <EnvApp {...envApp} />
      </div>
      <div hidden={activeTool !== 'logs'} data-testid="tool-panel-logs">
        <LogsApp {...logsApp} />
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
