import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseCspText } from './csp-parse.js';
import type { CspDirective } from '@nekotools/lens-csp';

/**
 * NekoCSP sub-app. Paste a Content-Security-Policy, see the directive table
 * or JSON projection, see basic security hints, copy. Pro (gated by the
 * suite license): a deep CSP posture audit + a hardened-policy suggestion.
 * Parsing and auditing run entirely in the browser — no requests, ever.
 */

export type CspViewMode = 'table' | 'json' | 'audit' | 'hardened';

export interface NekoCspUiState {
  readonly viewMode: CspViewMode;
}

export interface CspAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoCspUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = "default-src 'self'; script-src 'self' 'unsafe-inline'; img-src *";

const PRO_VIEWS = new Set<CspViewMode>(['audit', 'hardened']);
const VIEW_MODES: readonly CspViewMode[] = ['table', 'json', 'audit', 'hardened'];
const VIEW_LABELS: Record<CspViewMode, string> = {
  table: 'Table',
  json: 'JSON',
  audit: 'Audit ⭐',
  hardened: 'Hardened ⭐',
};

export function CspApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: CspAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<CspViewMode>(initialUiState?.viewMode ?? 'table');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(() => parseCspText(input, effectiveEntitlement), [input, effectiveEntitlement]);
  const directives = parsed.document?.directives ?? [];
  const hasDirectives = directives.length > 0;
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);

  const outputText =
    viewMode === 'json'
      ? parsed.jsonOutput
      : viewMode === 'audit'
        ? parsed.auditReport
        : viewMode === 'hardened'
          ? parsed.hardened
          : null;
  // Copy target: Pro views copy their own output; table + JSON both copy JSON.
  const copyText =
    viewMode === 'audit' ? parsed.auditReport : viewMode === 'hardened' ? parsed.hardened : parsed.jsonOutput;
  const copyLabel = viewMode === 'audit' ? 'Audit' : viewMode === 'hardened' ? 'hardened policy' : 'JSON';

  const handleCopy = useCallback(async () => {
    if (copyText === null || copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const result = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: result.ok, method: result.method });
  }, [copyText, clipboardDeps]);

  return (
    <section className="tool tool--csp" aria-label="NekoCSP workbench">
      <section className="paste card">
        <label htmlFor="csp-paste" className="paste__label">
          Paste a Content-Security-Policy here:
        </label>
        <textarea
          id="csp-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={6}
          data-testid="csp-input"
        />
        <p className="paste__hint">
          Parsing and auditing run entirely in your browser. No requests, no network, no telemetry.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="CSP view mode">
            <legend className="visually-hidden">CSP view mode</legend>
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="cspViewMode"
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
              disabled={copyText === null || copyText === ''}
              data-testid="csp-copy-json"
            >
              Copy {copyLabel}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="csp-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        {hasDirectives ? (
          isProView && !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="csp-locked">
              <strong>{viewMode === 'audit' ? 'Security audit' : 'Hardened policy'} is a Pro feature.</strong>
              <p>
                Audit the policy for unsafe-inline/eval, wildcards, insecure schemes, data: URIs, and
                a missing default-src — and generate a hardened policy you can paste straight back.
                Unlock with a license key (verified locally, works offline forever).
              </p>
            </div>
          ) : viewMode === 'table' ? (
            <div className="env-table" data-testid="csp-table">
              <table>
                <thead>
                  <tr>
                    <th>Directive</th>
                    <th>Sources</th>
                  </tr>
                </thead>
                <tbody>
                  {directives.map((directive: CspDirective, i: number) => (
                    <tr key={`${directive.name}-${i}`}>
                      <td>
                        <code>{directive.name}</code>
                      </td>
                      <td>{directive.sources.join(' ') || '(empty)'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <pre className="yaml-output" data-testid="csp-output" aria-label={`${viewMode} output`}>
              {outputText}
            </pre>
          )
        ) : (
          <div role="status" className="empty-state" data-testid="csp-no-document">
            No directives yet. Paste a Content-Security-Policy above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
