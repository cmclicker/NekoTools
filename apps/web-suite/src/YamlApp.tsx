import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseYamlText } from './yaml-parse.js';

/**
 * NekoYAML sub-app — Wave 2 PR 2 UI. Wires `@nekotools/lens-yaml` into the
 * shared web-suite shell as the fourth tool tab. Engine-MVP surface: paste
 * YAML, see line/column diagnostics, and view the safe YAML -> JSON
 * projection or a normalized YAML re-emit, with a copy affordance. The
 * shared `ProSurface` (Free/Pro) renders automatically via the tool
 * registry; this component is the panel only.
 */

export type YamlViewMode = 'json' | 'yaml';

export interface NekoYamlUiState {
  readonly viewMode: YamlViewMode;
}

export interface YamlAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoYamlUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = `# NekoYAML sample
name: nekotools
services:
  - api
  - web
config:
  retries: 3
  debug: false`;

export function YamlApp({
  initialInput,
  initialUiState,
  clipboardDeps,
}: YamlAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<YamlViewMode>(initialUiState?.viewMode ?? 'json');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseYamlText(input), [input]);

  const output = viewMode === 'json' ? parsed.jsonOutput : parsed.normalizedYaml;
  const hasOutput = output !== null;

  const handleCopy = useCallback(async () => {
    if (output === null) {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const result = await copyToClipboard(output, clipboardDeps);
    setCopyStatus({ ok: result.ok, method: result.method });
  }, [output, clipboardDeps]);

  return (
    <section className="tool tool--yaml" aria-label="NekoYAML workbench">
      <section className="paste card">
        <label htmlFor="yaml-paste" className="paste__label">
          Paste YAML here:
        </label>
        <textarea
          id="yaml-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={8}
          data-testid="yaml-input"
        />
        <p className="paste__hint">
          Parsing runs entirely in your browser. No network, no telemetry, nothing uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="YAML output mode">
            <legend className="visually-hidden">YAML output mode</legend>
            <label className={viewMode === 'json' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="yamlViewMode"
                value="json"
                checked={viewMode === 'json'}
                onChange={() => setViewMode('json')}
              />
              JSON
            </label>
            <label className={viewMode === 'yaml' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="yamlViewMode"
                value="yaml"
                checked={viewMode === 'yaml'}
                onChange={() => setViewMode('yaml')}
              />
              Normalized YAML
            </label>
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={!hasOutput}
              data-testid="yaml-copy-output"
            >
              Copy {viewMode === 'json' ? 'JSON' : 'YAML'}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="yaml-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: no output to copy.'}
            </p>
          ) : null}
        </div>

        {hasOutput ? (
          <pre
            className="yaml-output"
            data-testid="yaml-output"
            aria-label={viewMode === 'json' ? 'YAML to JSON output' : 'Normalized YAML output'}
          >
            {output}
          </pre>
        ) : (
          <div role="status" className="empty-state" data-testid="yaml-no-document">
            No YAML document yet. Paste YAML above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
