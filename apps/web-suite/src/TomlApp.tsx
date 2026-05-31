import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseTomlInput } from './toml-parse.js';

/**
 * NekoTOML sub-app. Wires `@nekotools/lens-toml` into the shared web-suite
 * shell as another DATA tool tab. Free surface: paste TOML, see the
 * decoded value tree as JSON, convert/normalize it, read structural
 * diagnostics (duplicate keys, parse errors with line numbers, unsupported
 * multi-line constructs), and copy the JSON / normalized TOML / markdown
 * summary. Pro (gated by the suite license): export the decoded tree as a
 * TypeScript type or an inferred JSON Schema. The shared `ProSurface`
 * (Free/Pro) renders via the tool registry; this component is the panel
 * only. Everything runs locally — NekoTOML never fetches or resolves
 * anything referenced in the document.
 */

export type TomlViewMode = 'json' | 'normalized' | 'markdown' | 'types' | 'schema';

export interface NekoTomlUiState {
  readonly viewMode: TomlViewMode;
}

export interface TomlAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoTomlUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const PRO_VIEWS = new Set<TomlViewMode>(['types', 'schema']);
const VIEW_MODES: readonly TomlViewMode[] = ['json', 'normalized', 'markdown', 'types', 'schema'];
const VIEW_LABELS: Record<TomlViewMode, string> = {
  json: 'JSON',
  normalized: 'Normalized TOML',
  markdown: 'Markdown',
  types: 'TypeScript ⭐',
  schema: 'JSON Schema ⭐',
};
const COPY_LABELS: Record<TomlViewMode, string> = {
  json: 'Copy JSON',
  normalized: 'Copy normalized TOML',
  markdown: 'Copy markdown summary',
  types: 'Copy TypeScript',
  schema: 'Copy JSON Schema',
};

const SAMPLE_INPUT = [
  '# NekoTOML — paste a TOML document',
  'title = "NekoTOML demo"',
  'version = 1',
  '',
  '[server]',
  'host = "localhost"',
  'port = 8080',
  'tags = ["local", "offline"]',
  '',
  '[[product]]',
  'name = "hammer"',
  '',
  '[[product]]',
  'name = "nail"',
].join('\n');

export function TomlApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: TomlAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<TomlViewMode>(initialUiState?.viewMode ?? 'json');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseTomlInput(input, effectiveEntitlement),
    [input, effectiveEntitlement],
  );
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);

  const output =
    viewMode === 'json'
      ? parsed.json
      : viewMode === 'normalized'
        ? parsed.normalized
        : viewMode === 'markdown'
          ? parsed.markdown
          : viewMode === 'types'
            ? parsed.types
            : parsed.schemaJson;
  const copyText = output ?? '';

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const result = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: result.ok, method: result.method });
  }, [copyText, clipboardDeps]);

  return (
    <section className="tool tool--toml" aria-label="NekoTOML workbench">
      <section className="paste card">
        <label htmlFor="toml-paste" className="paste__label">
          Paste TOML here:
        </label>
        <textarea
          id="toml-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={10}
          data-testid="toml-input"
        />
        <p className="paste__hint">
          Parsing runs entirely in your browser. No network, no file resolution, no telemetry,
          nothing uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="TOML output mode">
            <legend className="visually-hidden">TOML output mode</legend>
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="tomlViewMode"
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
              disabled={copyText === ''}
              data-testid="toml-copy-output"
            >
              {COPY_LABELS[viewMode]}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="toml-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="toml-stats">
          <li>
            valid: <strong data-testid="toml-stat-valid">{parsed.valid ? 'yes' : 'no'}</strong>
          </li>
          <li>
            tables: <strong data-testid="toml-stat-tables">{parsed.tableCount}</strong>
          </li>
          <li>
            keys: <strong data-testid="toml-stat-keys">{parsed.keyCount}</strong>
          </li>
        </ul>

        {parsed.data !== null ? (
          isProView && !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="toml-locked">
              <strong>
                {viewMode === 'types' ? 'TypeScript types export' : 'JSON Schema export'} is a Pro
                feature.
              </strong>
              <p>
                Generate a TypeScript type or an inferred JSON Schema from the decoded document.
                Unlock with a license key (verified locally, works offline forever).
              </p>
            </div>
          ) : (
            <pre className="toml-output" data-testid="toml-output" aria-label={`${viewMode} output`}>
              {output}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="toml-no-document">
            No TOML decoded yet. Paste a document above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
