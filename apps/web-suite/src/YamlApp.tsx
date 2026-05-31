import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { FileLoadControl } from './FileLoadControl.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseYamlText } from './yaml-parse.js';

/**
 * NekoYAML sub-app — Wave 2 PR 2 UI. Wires `@nekotools/lens-yaml` into the
 * shared web-suite shell as the fourth tool tab. Free surface: paste YAML,
 * see line/column diagnostics, and view the safe YAML -> JSON projection or
 * a normalized YAML re-emit, with a copy affordance. Pro (gated by the suite
 * license): a Markdown structure report and a YAML<->JSON round-trip
 * fidelity report. The shared `ProSurface` (Free/Pro) renders automatically
 * via the tool registry; this component is the panel only.
 */

export type YamlViewMode = 'json' | 'yaml' | 'schema-report' | 'roundtrip-diff';

export interface NekoYamlUiState {
  readonly viewMode: YamlViewMode;
}

export interface YamlAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoYamlUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const PRO_VIEWS = new Set<YamlViewMode>(['schema-report', 'roundtrip-diff']);
const COPY_LABELS: Record<YamlViewMode, string> = {
  json: 'Copy JSON',
  yaml: 'Copy YAML',
  'schema-report': 'Copy structure report',
  'roundtrip-diff': 'Copy round-trip report',
};

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
  entitlement,
}: YamlAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<YamlViewMode>(initialUiState?.viewMode ?? 'json');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseYamlText(input, effectiveEntitlement),
    [input, effectiveEntitlement],
  );
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);

  const output =
    viewMode === 'json'
      ? parsed.jsonOutput
      : viewMode === 'yaml'
        ? parsed.normalizedYaml
        : viewMode === 'schema-report'
          ? parsed.schemaReport
          : parsed.roundtripDiff;
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
        <div className="paste__head">
          <label htmlFor="yaml-paste" className="paste__label">
            Paste YAML here:
          </label>
          <FileLoadControl
            onText={(text) => setInput(text)}
            testId="yaml-file"
            label="…or load a file"
            ariaLabel="Load a local YAML file"
          />
        </div>
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
            <label className={viewMode === 'schema-report' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="yamlViewMode"
                value="schema-report"
                checked={viewMode === 'schema-report'}
                onChange={() => setViewMode('schema-report')}
              />
              Structure report ⭐
            </label>
            <label className={viewMode === 'roundtrip-diff' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="yamlViewMode"
                value="roundtrip-diff"
                checked={viewMode === 'roundtrip-diff'}
                onChange={() => setViewMode('roundtrip-diff')}
              />
              Round-trip diff ⭐
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
              {COPY_LABELS[viewMode]}
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

        {isProView && !proUnlocked && parsed.document !== null ? (
          <div className="pro-lock" role="status" data-testid="yaml-locked">
            <strong>
              {viewMode === 'schema-report' ? 'Structure report' : 'Round-trip diff'} is a Pro
              feature.
            </strong>
            <p>
              Generate a Markdown structure report of the parsed stream (top-level shape,
              anchor/alias presence, lossy-conversion notes) or a YAML&lt;-&gt;JSON round-trip
              fidelity report. All derived offline from the parsed document — nothing is uploaded.
              Unlock with a license key (verified locally, works offline forever).
            </p>
          </div>
        ) : hasOutput ? (
          <pre
            className="yaml-output"
            data-testid="yaml-output"
            aria-label={`${viewMode} output`}
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
