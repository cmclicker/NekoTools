import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { EnvDiffView } from './EnvDiffView.js';
import { EnvTableView, mask } from './EnvTableView.js';
import { EnvTextView } from './EnvTextView.js';
import { FileLoadControl } from './FileLoadControl.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { computeEnvDiff, parseEnvText } from './env-parse.js';

/**
 * NekoEnv sub-app — Phase 2.2 UI. Wires `@nekotools/lens-env` into
 * the shared web-suite shell with table / text / diff views, search,
 * copy.key / copy.value, and a mask.value toggle.
 *
 * The diff view is the new mode this PR introduces. It requires a
 * second "compare against" document; until the user pastes one, the
 * diff panel shows an empty-state hint.
 */

export type EnvViewMode =
  | 'table'
  | 'text'
  | 'diff'
  | 'types-ts'
  | 'types-zod'
  | 'data-dictionary'
  | 'compose';

export interface NekoEnvUiState {
  readonly viewMode: EnvViewMode;
  readonly activeKey: string | null;
  readonly searchQuery: string;
  readonly maskValues: boolean;
}

export interface EnvAppProps {
  readonly initialInput?: string;
  readonly initialCompareInput?: string;
  readonly initialUiState?: Partial<NekoEnvUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

const PRO_VIEWS = new Set<EnvViewMode>([
  'types-ts',
  'types-zod',
  'data-dictionary',
  'compose',
]);
const PRO_VIEW_MODES: readonly EnvViewMode[] = [
  'types-ts',
  'types-zod',
  'data-dictionary',
  'compose',
];
const PRO_VIEW_LABELS: Record<string, string> = {
  'types-ts': 'TypeScript ⭐',
  'types-zod': 'Zod ⭐',
  'data-dictionary': 'Data dictionary ⭐',
  compose: 'Compose ⭐',
};

interface CopyStatus {
  readonly kind: 'key' | 'value';
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
  readonly reason?: string;
}

const DEFAULT_UI_STATE: NekoEnvUiState = {
  viewMode: 'table',
  activeKey: null,
  searchQuery: '',
  maskValues: false,
};

const SAMPLE_INPUT = `# NekoEnv sample
DATABASE_URL=postgres://localhost/app
PORT=8080
DEBUG=true
FEATURE_FLAG=
# (the line above is intentionally empty so the schema infers it as 'empty')
`;

const SAMPLE_COMPARE_INPUT = `# Compare-against sample (production)
DATABASE_URL=postgres://prod-db/app
PORT=443
DEBUG=false
FEATURE_FLAG=enabled
`;

export function EnvApp({
  initialInput,
  initialCompareInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: EnvAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [compareInput, setCompareInput] = useState<string>(
    initialCompareInput ?? SAMPLE_COMPARE_INPUT,
  );
  const [viewMode, setViewMode] = useState<EnvViewMode>(
    initialUiState?.viewMode ?? DEFAULT_UI_STATE.viewMode,
  );
  const [activeKey, setActiveKey] = useState<string | null>(
    initialUiState?.activeKey ?? DEFAULT_UI_STATE.activeKey,
  );
  const [searchQuery, setSearchQuery] = useState<string>(
    initialUiState?.searchQuery ?? DEFAULT_UI_STATE.searchQuery,
  );
  const [maskValues, setMaskValues] = useState<boolean>(
    initialUiState?.maskValues ?? DEFAULT_UI_STATE.maskValues,
  );
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseEnvText(input, effectiveEntitlement),
    [input, effectiveEntitlement],
  );
  const parsedCompare = useMemo(() => parseEnvText(compareInput), [compareInput]);
  const diff = useMemo(
    () => computeEnvDiff(parsed.artifact, parsedCompare.artifact),
    [parsed.artifact, parsedCompare.artifact],
  );
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);
  const proOutput =
    viewMode === 'types-ts'
      ? parsed.typescript
      : viewMode === 'types-zod'
        ? parsed.zod
        : viewMode === 'data-dictionary'
          ? parsed.dataDictionary
          : viewMode === 'compose'
            ? parsed.composeStack
            : null;

  const activeEntry = useMemo(() => {
    if (!parsed.document || activeKey === null) return null;
    // Last-occurrence-wins, matching env.key parser semantics.
    for (let i = parsed.document.entries.length - 1; i >= 0; i -= 1) {
      const e = parsed.document.entries[i]!;
      if (e.key === activeKey) return e;
    }
    return null;
  }, [parsed.document, activeKey]);

  const handleCopyKey = useCallback(async () => {
    if (activeKey === null) return;
    const result = await copyToClipboard(activeKey, clipboardDeps);
    setCopyStatus({
      kind: 'key',
      ok: result.ok,
      method: result.method,
      ...(result.reason !== undefined && { reason: result.reason }),
    });
  }, [activeKey, clipboardDeps]);

  const handleCopyValue = useCallback(async () => {
    if (activeEntry === null) {
      setCopyStatus({
        kind: 'value',
        ok: false,
        method: 'none',
        reason: 'no key selected',
      });
      return;
    }
    // Copy the *real* value, not the masked rendering. Masking is a
    // view-layer preference; a copy that quietly handed the user
    // `••••••••` would be a footgun.
    const result = await copyToClipboard(activeEntry.value, clipboardDeps);
    setCopyStatus({
      kind: 'value',
      ok: result.ok,
      method: result.method,
      ...(result.reason !== undefined && { reason: result.reason }),
    });
  }, [activeEntry, clipboardDeps]);

  const copyKeyDisabled = activeKey === null;
  const copyValueDisabled = activeEntry === null;

  return (
    <section className="tool tool--env" aria-label="NekoEnv workbench">
      <section className="paste card">
        <label htmlFor="env-paste" className="paste__label">
          Paste a dotenv document here:
        </label>
        <FileLoadControl
          onText={(text) => setInput(text)}
          testId="env-file"
          label="…or load a .env file"
          ariaLabel="Load a local dotenv file"
        />
        <textarea
          id="env-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={6}
          data-testid="env-input"
        />
        {viewMode === 'diff' ? (
          <>
            <label htmlFor="env-compare" className="paste__label">
              Compare against (a second dotenv document):
            </label>
            <FileLoadControl
              onText={(text) => setCompareInput(text)}
              testId="env-file-2"
              label="…or load a .env file to compare against"
              ariaLabel="Load a local dotenv file to compare against"
            />
            <textarea
              id="env-compare"
              className="paste__textarea"
              value={compareInput}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setCompareInput(e.target.value)
              }
              spellCheck={false}
              rows={6}
              data-testid="env-compare-input"
            />
          </>
        ) : null}
        <p className="paste__hint">
          Parsing runs entirely in your browser. No remote secret stores,
          no variable expansion, no network.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Env view mode">
            <legend className="visually-hidden">Env view mode</legend>
            <label className={viewMode === 'table' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="envViewMode"
                value="table"
                checked={viewMode === 'table'}
                onChange={() => setViewMode('table')}
              />
              Table
            </label>
            <label className={viewMode === 'text' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="envViewMode"
                value="text"
                checked={viewMode === 'text'}
                onChange={() => setViewMode('text')}
              />
              Text
            </label>
            <label className={viewMode === 'diff' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="envViewMode"
                value="diff"
                checked={viewMode === 'diff'}
                onChange={() => setViewMode('diff')}
              />
              Diff
            </label>
            {PRO_VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="envViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                />
                {PRO_VIEW_LABELS[m]}
              </label>
            ))}
          </fieldset>

          <label className="search">
            <span className="visually-hidden">Search keys and values</span>
            <input
              type="search"
              placeholder="Search keys / values…"
              value={searchQuery}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              data-testid="env-search-input"
            />
          </label>

          <label className="mask">
            <input
              type="checkbox"
              checked={maskValues}
              onChange={(e) => setMaskValues(e.target.checked)}
              data-testid="env-mask-toggle"
            />
            Mask values
          </label>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopyKey}
              disabled={copyKeyDisabled}
              data-testid="env-copy-key"
            >
              Copy key
            </button>
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopyValue}
              disabled={copyValueDisabled}
              data-testid="env-copy-value"
            >
              Copy value
            </button>
          </div>

          {activeKey !== null ? (
            <p className="results__path" data-testid="env-active-key">
              Active key: <code>{activeKey}</code>
              {activeEntry !== null ? (
                <>
                  {' '}
                  · value:{' '}
                  <code data-testid="env-active-value">
                    {maskValues && activeEntry.value !== '' ? mask(activeEntry.value) : activeEntry.value || '(empty)'}
                  </code>
                </>
              ) : null}
            </p>
          ) : (
            <p className="results__path" data-testid="env-active-key">
              No key selected.
            </p>
          )}

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="env-copy-status"
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

        {isProView ? (
          !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="env-locked">
              <strong>Codegen exports are a Pro feature.</strong>
              <p>
                Generate a typed <code>ProcessEnv</code> interface or a Zod schema from these
                variables, a cross-document data dictionary, and a Docker Compose / Kubernetes
                ConfigMap stack to drop into your deployment. Unlock with a license key (verified
                locally, works offline forever).
              </p>
            </div>
          ) : parsed.document !== null ? (
            <pre className="yaml-output" data-testid="env-output" aria-label={`${viewMode} output`}>
              {proOutput}
            </pre>
          ) : (
            <div role="status" className="empty-state" data-testid="env-no-document">
              No dotenv document yet. Fix the diagnostics below or switch
              to the Text view to inspect the raw input.
            </div>
          )
        ) : viewMode === 'table' ? (
          parsed.document !== null ? (
            <EnvTableView
              document={parsed.document}
              searchQuery={searchQuery}
              activeKey={activeKey}
              onSelectKey={setActiveKey}
              maskValues={maskValues}
            />
          ) : (
            <div role="status" className="empty-state" data-testid="env-no-document">
              No dotenv document yet. Fix the diagnostics below or switch
              to the Text view to inspect the raw input.
            </div>
          )
        ) : viewMode === 'text' ? (
          <EnvTextView text={input} diagnostics={parsed.diagnostics} />
        ) : (
          <EnvDiffView diff={diff} maskValues={maskValues} />
        )}

        <Diagnostics
          diagnostics={
            viewMode === 'diff'
              ? [...parsed.diagnostics, ...parsedCompare.diagnostics]
              : parsed.diagnostics
          }
        />
      </section>
    </section>
  );
}
