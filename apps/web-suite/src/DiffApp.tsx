import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import type { DiffMode } from '@nekotools/lens-diff';
import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { computeDiff } from './diff-parse.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';

/**
 * NekoDiff sub-app — the NekoDiff vertical-slice UI. Wires
 * `@nekotools/lens-diff` into the shared web-suite shell as a tool tab:
 * two input panes (Left / Right), a compare-mode selector (Text / JSON /
 * YAML), a view selector (Unified / JSON summary / Markdown, plus the Pro
 * Semantic and Signed-bundle views), a changed-line summary, a unified hunk
 * view, copy of the unified diff, and engine diagnostics (empty side, parse
 * failure, large input, binary-looking input). Pro (gated by the suite
 * license): a token/key-level semantic diff and a canonical signable bundle.
 * The UI never signs — the bundle view renders the unsigned signable JSON.
 */

export type { DiffMode } from '@nekotools/lens-diff';

export type DiffViewMode = 'unified' | 'json' | 'markdown' | 'semantic' | 'signed-bundle';

export interface NekoDiffUiState {
  readonly mode: DiffMode;
  readonly viewMode: DiffViewMode;
}

export interface DiffAppProps {
  readonly initialLeft?: string;
  readonly initialRight?: string;
  readonly initialUiState?: Partial<NekoDiffUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const MODES: readonly { readonly id: DiffMode; readonly label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
];

const PRO_VIEWS = new Set<DiffViewMode>(['semantic', 'signed-bundle']);
const VIEW_MODES: readonly DiffViewMode[] = [
  'unified',
  'json',
  'markdown',
  'semantic',
  'signed-bundle',
];
const VIEW_LABELS: Record<DiffViewMode, string> = {
  unified: 'Unified',
  json: 'JSON summary',
  markdown: 'Markdown',
  semantic: 'Semantic ⭐',
  'signed-bundle': 'Signed bundle ⭐',
};

const SAMPLE_LEFT = `name: nekotools
version: 1
features:
  - diff
  - json`;

const SAMPLE_RIGHT = `name: nekotools
version: 2
features:
  - diff
  - json
  - yaml`;

export function DiffApp({
  initialLeft,
  initialRight,
  initialUiState,
  clipboardDeps,
  entitlement,
}: DiffAppProps = {}): JSX.Element {
  const [left, setLeft] = useState<string>(initialLeft ?? SAMPLE_LEFT);
  const [right, setRight] = useState<string>(initialRight ?? SAMPLE_RIGHT);
  const [mode, setMode] = useState<DiffMode>(initialUiState?.mode ?? 'text');
  const [viewMode, setViewMode] = useState<DiffViewMode>(initialUiState?.viewMode ?? 'unified');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const out = useMemo(
    () => computeDiff(left, right, mode, effectiveEntitlement),
    [left, right, mode, effectiveEntitlement],
  );
  const result = out.result;
  const proUnlocked = out.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);
  const proOutput = viewMode === 'semantic' ? out.semantic : out.signedBundle;

  const handleCopy = useCallback(async () => {
    if (out.unified === null) {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(out.unified, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [out.unified, clipboardDeps]);

  const showHunks =
    result !== null && result.comparable && !result.summary.identical && result.hunks.length > 0;

  return (
    <section className="tool tool--diff" aria-label="NekoDiff workbench">
      <div className="diff-inputs">
        <section className="paste card">
          <label htmlFor="diff-left" className="paste__label">
            Left
          </label>
          <textarea
            id="diff-left"
            className="paste__textarea"
            value={left}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setLeft(e.target.value)}
            spellCheck={false}
            rows={8}
            data-testid="diff-input-left"
          />
        </section>
        <section className="paste card">
          <label htmlFor="diff-right" className="paste__label">
            Right
          </label>
          <textarea
            id="diff-right"
            className="paste__textarea"
            value={right}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setRight(e.target.value)}
            spellCheck={false}
            rows={8}
            data-testid="diff-input-right"
          />
        </section>
      </div>

      <p className="paste__hint">
        Comparison runs entirely in your browser. No network, no telemetry, nothing uploaded.
      </p>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Diff mode">
            <legend className="visually-hidden">Diff mode</legend>
            {MODES.map((m) => (
              <label key={m.id} className={mode === m.id ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="diffMode"
                  value={m.id}
                  checked={mode === m.id}
                  onChange={() => setMode(m.id)}
                />
                {m.label}
              </label>
            ))}
          </fieldset>

          <fieldset className="viewmode" aria-label="Diff view mode">
            <legend className="visually-hidden">Diff view mode</legend>
            {VIEW_MODES.map((v) => (
              <label key={v} className={viewMode === v ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="diffViewMode"
                  value={v}
                  checked={viewMode === v}
                  onChange={() => setViewMode(v)}
                  data-testid={`diff-view-${v}`}
                />
                {VIEW_LABELS[v]}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={out.unified === null}
              data-testid="diff-copy"
            >
              Copy unified diff
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="diff-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: no diff to copy.'}
            </p>
          ) : null}
        </div>

        {result !== null ? (
          <p className="diff-summary" data-testid="diff-summary" role="status">
            {!result.comparable
              ? 'Not comparable — see diagnostics below.'
              : result.summary.identical
                ? 'No differences.'
                : `${result.summary.added} added, ${result.summary.removed} removed, ${result.summary.unchanged} unchanged (${result.summary.changed} changed).`}
          </p>
        ) : null}

        {isProView ? (
          !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="diff-locked">
              <strong>
                {viewMode === 'semantic' ? 'Semantic diff' : 'Signed bundle'} is a Pro feature.
              </strong>
              <p>
                Render a token/key-level semantic diff (intra-line word changes and changed JSON/YAML
                key paths), or export a canonical signable bundle of the result. Unlock with a license
                key (verified locally, works offline forever).
              </p>
            </div>
          ) : (
            <pre
              className="toml-output diff-pro-output"
              data-testid="diff-output"
              aria-label={`${viewMode} output`}
            >
              {proOutput}
            </pre>
          )
        ) : viewMode === 'json' || viewMode === 'markdown' ? (
          result !== null ? (
            <pre
              className="toml-output diff-pro-output"
              data-testid="diff-output"
              aria-label={`${viewMode} output`}
            >
              {viewMode === 'json' ? out.jsonSummary : out.markdown}
            </pre>
          ) : (
            <div role="status" className="empty-state" data-testid="diff-no-output">
              No diff to show yet. Paste content into Left and Right (or check the diagnostics below).
            </div>
          )
        ) : showHunks ? (
          <div
            className="diff-output"
            role="region"
            aria-label="NekoDiff output"
            data-testid="diff-output"
          >
            <header className="diff-output__header">
              <span className="diff-output__minus">--- {result.leftLabel}</span>
              <span className="diff-output__plus">+++ {result.rightLabel}</span>
            </header>
            <ol className="diff-output__hunks">
              {result.hunks.map((h, i) => (
                <li
                  key={i}
                  className={`diff-output__hunk diff-output__hunk--${h.kind}`}
                  data-testid="diff-hunk"
                  data-kind={h.kind}
                >
                  <span className="diff-output__marker" aria-hidden="true">
                    {h.kind === 'add' ? '+' : h.kind === 'remove' ? '-' : ' '}
                  </span>
                  <code className="diff-output__text">{h.text}</code>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div role="status" className="empty-state" data-testid="diff-no-output">
            {result !== null && result.comparable && result.summary.identical
              ? 'The two inputs are identical.'
              : 'No diff to show yet. Paste content into Left and Right (or check the diagnostics below).'}
          </div>
        )}

        <Diagnostics diagnostics={out.diagnostics} />
      </section>
    </section>
  );
}
