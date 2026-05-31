import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { FileLoadControl } from './FileLoadControl.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { scanSecrets } from './secrets-parse.js';

/**
 * NekoSecrets sub-app. Free surface: scan pasted text (or a locally-loaded
 * file) for leaked credentials (30 detection rules + entropy), masked
 * previews, severity filter, JSON/CSV/Markdown export — all local. Pro
 * surface (gated by a license entitlement): SARIF, redacted source, a
 * self-contained HTML report, and a CI baseline. The cleartext secret only
 * ever lives in your input box; nothing is uploaded, ever.
 */

type Severity = 'high' | 'medium' | 'low';

export type SecretsViewMode =
  | 'findings'
  | 'json'
  | 'csv'
  | 'markdown'
  | 'sarif'
  | 'redacted'
  | 'html'
  | 'baseline';

export interface NekoSecretsUiState {
  readonly viewMode: SecretsViewMode;
  /** Local Pro unlock (dev/demo). A real build verifies a signed license key. */
  readonly proUnlocked: boolean;
  /** Play a soft local chime when a scan surfaces new findings (default off). */
  readonly soundOn: boolean;
}

export interface SecretsAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoSecretsUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to free unless the dev toggle unlocks it. */
  readonly entitlement?: Entitlement;
  /** Injected audio cue (tests). Defaults to a local Web Audio chime. */
  readonly playChime?: () => void;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = [
  '# paste config, logs, or code — nothing leaves your machine',
  'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
  'github_token: ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'DB_PASSWORD = "hunter2hunter2"',
  'DATABASE_URL=postgres://app:s3cr3tpassword@db.internal:5432/app',
  'note: this line is fine and will not be flagged',
].join('\n');

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const ALL_SEVERITIES: readonly Severity[] = ['high', 'medium', 'low'];

const VIEW_MODES: readonly SecretsViewMode[] = [
  'findings',
  'json',
  'csv',
  'markdown',
  'sarif',
  'redacted',
  'html',
  'baseline',
];

const VIEW_LABELS: Record<SecretsViewMode, string> = {
  findings: 'Findings',
  json: 'JSON',
  csv: 'CSV',
  markdown: 'Markdown',
  sarif: 'SARIF ⭐',
  redacted: 'Redacted ⭐',
  html: 'HTML ⭐',
  baseline: 'Baseline ⭐',
};

const COPY_LABELS: Record<SecretsViewMode, string> = {
  findings: 'Copy markdown summary',
  json: 'Copy JSON',
  csv: 'Copy CSV',
  markdown: 'Copy markdown',
  sarif: 'Copy SARIF',
  redacted: 'Copy redacted',
  html: 'Copy HTML',
  baseline: 'Copy baseline',
};

const PRO_VIEWS = new Set<SecretsViewMode>(['sarif', 'redacted', 'html', 'baseline']);

const PRO_LOCK_COPY: Record<string, { title: string; body: string }> = {
  sarif: {
    title: 'SARIF export',
    body: 'Export findings as SARIF 2.1.0 to wire NekoSecrets into CI code-scanning dashboards.',
  },
  redacted: {
    title: 'Redacted source',
    body: 'Get a copy of your input with every detected secret replaced by [REDACTED:rule] — safe to share.',
  },
  html: {
    title: 'HTML report',
    body: 'A self-contained, offline HTML report (no remote assets) you can attach to a ticket or archive.',
  },
  baseline: {
    title: 'CI baseline',
    body: 'A deterministic fingerprint baseline so CI can suppress reviewed findings and fail only on new ones.',
  },
};

/** Local dev/demo entitlement (a real build derives this from a signed key). */
const DEV_PRO: Entitlement = {
  version: 1,
  licenseId: 'dev',
  licensee: 'Local Dev Unlock',
  tier: 'pro',
  features: ['*'],
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  signature: 'dev',
};

/** A short, soft, locally-synthesized chime (no asset file, no network). */
function defaultChime(): void {
  try {
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (Ctx === undefined) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio unavailable — silently no-op */
  }
}

function proOutputFor(mode: SecretsViewMode, result: ReturnType<typeof scanSecrets>): string | null {
  switch (mode) {
    case 'sarif':
      return result.sarif;
    case 'redacted':
      return result.redacted;
    case 'html':
      return result.html;
    case 'baseline':
      return result.baseline;
    default:
      return null;
  }
}

export function SecretsApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
  playChime = defaultChime,
}: SecretsAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<SecretsViewMode>(initialUiState?.viewMode ?? 'findings');
  const [devUnlock, setDevUnlock] = useState<boolean>(initialUiState?.proUnlocked ?? false);
  const [soundOn, setSoundOn] = useState<boolean>(initialUiState?.soundOn ?? false);
  const [enabled, setEnabled] = useState<Set<Severity>>(() => new Set(ALL_SEVERITIES));
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  // The suite-wide license (set via the header) is the real unlock; the
  // explicit `entitlement` prop overrides it (tests/embeds), and the dev
  // toggle is a local stand-in shown only when neither already grants Pro.
  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? (devUnlock ? DEV_PRO : license.entitlement);
  const showDevToggle = entitlement === undefined && !license.isPro;
  const result = useMemo(() => scanSecrets(input, effectiveEntitlement), [input, effectiveEntitlement]);
  const proUnlocked = result.proUnlocked;

  // Opt-in audio cue when a scan surfaces a *new* number of findings.
  const prevCount = useRef(result.findingCount);
  useEffect(() => {
    if (soundOn && result.findingCount > 0 && result.findingCount !== prevCount.current) {
      playChime();
    }
    prevCount.current = result.findingCount;
  }, [result.findingCount, soundOn, playChime]);

  const isProView = PRO_VIEWS.has(viewMode);
  const proOutput = proOutputFor(viewMode, result);
  const copyText =
    viewMode === 'findings'
      ? result.markdown
      : viewMode === 'json'
        ? result.json
        : viewMode === 'csv'
          ? result.csv
          : viewMode === 'markdown'
            ? result.markdown
            : (proOutput ?? '');

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const r = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: r.ok, method: r.method });
  }, [copyText, clipboardDeps]);

  const toggleSeverity = useCallback((sev: Severity) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  }, []);

  const sortedFindings = useMemo(
    () =>
      [...result.findings]
        .filter((f) => enabled.has(f.severity))
        .sort(
          (a, b) =>
            (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
            a.line - b.line ||
            a.column - b.column,
        ),
    [result.findings, enabled],
  );

  const copyDisabled = isProView ? !proUnlocked || copyText === '' : copyText === '';

  return (
    <section className="tool tool--secrets tool--cols" aria-label="NekoSecrets workbench">
      <section className="paste card">
        <div className="paste__head">
          <label htmlFor="secrets-paste" className="paste__label">
            Paste text to scan for leaked credentials:
          </label>
          <FileLoadControl
            onText={(text) => setInput(text)}
            className="secrets__file"
            testId="secrets-file"
            label="Load a local file"
            ariaLabel="Load a local file to scan"
          />
        </div>
        <textarea
          id="secrets-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={10}
          data-testid="secrets-input"
        />
        <p className="paste__hint">
          Scanning runs entirely in your browser. The cleartext only lives in this box — findings
          store masked previews only, files are read locally, and nothing is ever uploaded.
        </p>
        <div className="secrets__options">
          {showDevToggle ? (
            <label className="cookies-mask">
              <input
                type="checkbox"
                checked={devUnlock}
                onChange={(e) => setDevUnlock(e.target.checked)}
                data-testid="secrets-pro-toggle"
              />
              Unlock Pro (dev) —{' '}
              {proUnlocked ? `Licensed to ${DEV_PRO.licensee}` : 'SARIF, redacted, HTML, baseline'}
            </label>
          ) : null}
          <label className="cookies-mask">
            <input
              type="checkbox"
              checked={soundOn}
              onChange={(e) => setSoundOn(e.target.checked)}
              data-testid="secrets-sound-toggle"
            />
            Sound on new findings
          </label>
        </div>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Secrets output mode">
            <legend className="visually-hidden">Secrets output mode</legend>
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="secretsViewMode"
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
              disabled={copyDisabled}
              data-testid="secrets-copy-output"
            >
              {COPY_LABELS[viewMode]}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="secrets-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats secrets-stats" data-testid="secrets-stats">
          <li>
            findings: <strong data-testid="secrets-stat-count">{result.findingCount}</strong>
          </li>
          <li className="secrets-stat--high">
            high: <strong data-testid="secrets-stat-high">{result.severityCounts.high}</strong>
          </li>
          <li className="secrets-stat--medium">
            medium: <strong data-testid="secrets-stat-medium">{result.severityCounts.medium}</strong>
          </li>
          <li className="secrets-stat--low">
            low: <strong data-testid="secrets-stat-low">{result.severityCounts.low}</strong>
          </li>
          <li>
            bytes: <strong>{result.inputBytes}</strong>
          </li>
        </ul>

        {viewMode === 'findings' && result.findingCount > 0 ? (
          <fieldset className="secrets-filter" data-testid="secrets-filter">
            <legend>Show severities</legend>
            {ALL_SEVERITIES.map((sev) => (
              <label key={sev} className={`secrets-filter__opt secrets-filter__opt--${sev}`}>
                <input
                  type="checkbox"
                  checked={enabled.has(sev)}
                  onChange={() => toggleSeverity(sev)}
                  data-testid={`secrets-filter-${sev}`}
                />
                {sev}
              </label>
            ))}
          </fieldset>
        ) : null}

        {isProView && !proUnlocked ? (
          <div className="pro-lock" role="status" data-testid="secrets-locked">
            <strong>{PRO_LOCK_COPY[viewMode]?.title ?? 'This'} is a Pro feature.</strong>
            <p>
              {PRO_LOCK_COPY[viewMode]?.body}{' '}
              Unlock with a license key (verified locally, works offline forever).
            </p>
          </div>
        ) : result.findingCount > 0 ? (
          viewMode === 'findings' ? (
            sortedFindings.length > 0 ? (
              <table className="url-params secrets-table" data-testid="secrets-table">
                <thead>
                  <tr>
                    <th scope="col">severity</th>
                    <th scope="col">rule</th>
                    <th scope="col">what</th>
                    <th scope="col">line:col</th>
                    <th scope="col">preview (masked)</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFindings.map((f, i) => (
                    <tr key={`${f.ruleId}-${f.line}-${f.column}-${i}`} data-severity={f.severity}>
                      <td data-testid={`secrets-sev-${i}`}>
                        <span className={`sev-badge sev-badge--${f.severity}`}>{f.severity}</span>
                      </td>
                      <td>
                        <code>{f.ruleId}</code>
                      </td>
                      <td className="secrets-table__desc">{f.description}</td>
                      <td>
                        {f.line}:{f.column}
                      </td>
                      <td data-testid={`secrets-preview-${i}`}>
                        <code>{f.preview}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div role="status" className="empty-state" data-testid="secrets-no-match">
                No findings match the current severity filter.
              </div>
            )
          ) : (
            <pre className="toml-output" data-testid="secrets-output" aria-label={`${viewMode} output`}>
              {viewMode === 'json'
                ? result.json
                : viewMode === 'csv'
                  ? result.csv
                  : viewMode === 'markdown'
                    ? result.markdown
                    : (proOutput ?? '')}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="secrets-clean">
            No secrets detected. Paste config, logs, or code above — or load a local file — to scan.
          </div>
        )}

        <Diagnostics diagnostics={result.diagnostics} />
      </section>
    </section>
  );
}
