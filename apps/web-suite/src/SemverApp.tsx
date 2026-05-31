import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseSemverInput } from './semver-parse.js';

/**
 * NekoSemver sub-app. Wires `@nekotools/lens-semver` into the shared
 * web-suite shell as a Utility tool tab. Free surface: paste versions (one
 * per line), optionally enter a range to test, and see components, the
 * ascending sort, and per-version satisfies — plus JSON / sorted / markdown
 * copy. Pro (gated by the suite license): a markdown range report and a
 * bump plan. All local; no registry lookups.
 */

export type SemverViewMode =
  | 'table'
  | 'json'
  | 'sorted'
  | 'markdown'
  | 'range-report'
  | 'bump-plan';

export interface NekoSemverUiState {
  readonly range: string;
  readonly viewMode: SemverViewMode;
}

export interface SemverAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoSemverUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const PRO_VIEWS = new Set<SemverViewMode>(['range-report', 'bump-plan']);
const VIEW_MODES: readonly SemverViewMode[] = [
  'table',
  'json',
  'sorted',
  'markdown',
  'range-report',
  'bump-plan',
];
const VIEW_LABELS: Record<SemverViewMode, string> = {
  table: 'Table',
  json: 'JSON',
  sorted: 'Sorted',
  markdown: 'Markdown',
  'range-report': 'Range report ⭐',
  'bump-plan': 'Bump plan ⭐',
};
const COPY_LABELS: Record<SemverViewMode, string> = {
  table: 'Copy markdown summary',
  json: 'Copy JSON',
  sorted: 'Copy sorted',
  markdown: 'Copy markdown summary',
  'range-report': 'Copy range report',
  'bump-plan': 'Copy bump plan',
};

const SAMPLE_INPUT = ['1.2.0', '1.10.0', '1.2.0-rc.1', '2.0.0-beta', '0.9.9'].join('\n');

export function SemverApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: SemverAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [range, setRange] = useState<string>(initialUiState?.range ?? '^1.2.0');
  const [viewMode, setViewMode] = useState<SemverViewMode>(initialUiState?.viewMode ?? 'table');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseSemverInput(input, range, effectiveEntitlement),
    [input, range, effectiveEntitlement],
  );
  const hasRange = parsed.range !== null;
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);

  const proOutput =
    viewMode === 'range-report' ? parsed.rangeReport : viewMode === 'bump-plan' ? parsed.bumpPlan : null;
  const copyText =
    viewMode === 'json'
      ? parsed.json
      : viewMode === 'sorted'
        ? parsed.sorted
        : isProView
          ? (proOutput ?? '')
          : parsed.markdown;

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [copyText, clipboardDeps]);

  return (
    <section className="tool tool--semver" aria-label="NekoSemver workbench">
      <section className="paste card">
        <label htmlFor="semver-paste" className="paste__label">
          Paste semantic versions (one per line):
        </label>
        <textarea
          id="semver-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={6}
          data-testid="semver-input"
        />
        <div className="results__toolbar">
          <label className="cookies-mask" htmlFor="semver-range">
            Range:
            <input
              id="semver-range"
              type="text"
              className="semver-range-input"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              placeholder="e.g. ^1.2.0 || ~2.0.0"
              spellCheck={false}
              data-testid="semver-range"
            />
          </label>
        </div>
        <p className="paste__hint">
          Comparison and range matching run entirely in your browser. No npm/registry lookups.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Semver output mode">
            <legend className="visually-hidden">Semver output mode</legend>
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="semverViewMode"
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
              data-testid="semver-copy-output"
            >
              {COPY_LABELS[viewMode]}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="semver-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="semver-stats">
          <li>
            versions: <strong data-testid="semver-stat-count">{parsed.count}</strong>
          </li>
          {hasRange ? (
            <li>
              range: <strong>{parsed.range}</strong>
            </li>
          ) : null}
        </ul>

        {parsed.count > 0 ? (
          isProView ? (
            !proUnlocked ? (
              <div className="pro-lock" role="status" data-testid="semver-locked">
                <strong>
                  {viewMode === 'range-report' ? 'Range report' : 'Bump plan'} export is a Pro feature.
                </strong>
                <p>
                  Export a markdown report of which versions match the range, or a bump plan of the
                  candidate next-major / next-minor / next-patch versions. Unlock with a license key
                  (verified locally, works offline forever).
                </p>
              </div>
            ) : (
              <pre className="toml-output" data-testid="semver-output" aria-label={`${viewMode} output`}>
                {proOutput}
              </pre>
            )
          ) : viewMode === 'table' ? (
            <table className="url-params" data-testid="semver-table">
              <thead>
                <tr>
                  <th scope="col">input</th>
                  <th scope="col">valid</th>
                  <th scope="col">normalized</th>
                  <th scope="col">prerelease</th>
                  {hasRange ? <th scope="col">satisfies</th> : null}
                </tr>
              </thead>
              <tbody>
                {parsed.versions.map((v, i) => (
                  <tr key={`${v.input}-${i}`} data-valid={v.valid}>
                    <td>{v.input}</td>
                    <td>{v.valid ? 'yes' : 'no'}</td>
                    <td>{v.version ?? '—'}</td>
                    <td>{v.components?.prerelease ?? '—'}</td>
                    {hasRange ? (
                      <td data-testid={`semver-satisfies-${i}`}>
                        {v.satisfies === null ? '—' : v.satisfies ? 'yes' : 'no'}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre className="toml-output" data-testid="semver-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json' ? parsed.json : viewMode === 'sorted' ? parsed.sorted : parsed.markdown}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="semver-no-document">
            No versions yet. Paste a semantic version above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
