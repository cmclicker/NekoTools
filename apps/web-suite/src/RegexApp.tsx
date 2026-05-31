import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps, type CopyMethod } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { runRegex } from './regex-parse.js';

/**
 * NekoRegex sub-app. Wires `@nekotools/lens-regex` into the shared web-suite
 * shell as a tool tab. Type a pattern + flags, paste sample text, and see the
 * match count, every match with its offsets, numbered + named capture groups,
 * plus safety diagnostics. Pro (gated by the suite license): a markdown
 * structural explanation of the pattern and a declarative JSON redaction
 * recipe. Native RegExp only — no eval, no network.
 */

export type RegexViewMode = 'matches' | 'explain' | 'redaction';

export interface NekoRegexUiState {
  readonly viewMode: RegexViewMode;
}

export interface RegexAppProps {
  readonly initialPattern?: string;
  readonly initialFlags?: string;
  readonly initialSample?: string;
  readonly initialUiState?: Partial<NekoRegexUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

const PRO_VIEWS = new Set<RegexViewMode>(['explain', 'redaction']);
const VIEW_MODES: readonly RegexViewMode[] = ['matches', 'explain', 'redaction'];
const VIEW_LABELS: Record<RegexViewMode, string> = {
  matches: 'Matches',
  explain: 'Explain ⭐',
  redaction: 'Redaction recipe ⭐',
};

interface CopyStatus {
  readonly ok: boolean;
  readonly method: CopyMethod;
  readonly label: string;
}

const SAMPLE_PATTERN = '(\\w+)@(\\w+\\.\\w+)';
const SAMPLE_FLAGS = 'g';
const SAMPLE_TEXT = 'Contact alice@example.com or bob@test.org for access.';

export function RegexApp({
  initialPattern,
  initialFlags,
  initialSample,
  initialUiState,
  clipboardDeps,
  entitlement,
}: RegexAppProps = {}): JSX.Element {
  const [pattern, setPattern] = useState<string>(initialPattern ?? SAMPLE_PATTERN);
  const [flags, setFlags] = useState<string>(initialFlags ?? SAMPLE_FLAGS);
  const [sample, setSample] = useState<string>(initialSample ?? SAMPLE_TEXT);
  const [viewMode, setViewMode] = useState<RegexViewMode>(initialUiState?.viewMode ?? 'matches');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => runRegex(pattern, flags, sample, effectiveEntitlement),
    [pattern, flags, sample, effectiveEntitlement],
  );
  const matchSet = parsed.matchSet;
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);
  const proOutput = viewMode === 'explain' ? parsed.explain : viewMode === 'redaction' ? parsed.redactionRecipe : null;

  const handleCopy = useCallback(
    async (label: string, text: string | null) => {
      if (text === null) {
        setCopyStatus({ ok: false, method: 'none', label });
        return;
      }
      const result = await copyToClipboard(text, clipboardDeps);
      setCopyStatus({ ok: result.ok, method: result.method, label });
    },
    [clipboardDeps],
  );

  const hasMatches = matchSet !== null && matchSet.valid && matchSet.matches.length > 0;

  return (
    <section className="tool tool--regex" aria-label="NekoRegex workbench">
      <section className="paste card">
        <label htmlFor="regex-pattern" className="paste__label">
          Pattern
        </label>
        <div className="regex-pattern-row">
          <span className="regex-delim" aria-hidden="true">
            /
          </span>
          <input
            id="regex-pattern"
            type="text"
            className="regex-input regex-input--pattern"
            value={pattern}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPattern(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            data-testid="regex-pattern"
            aria-label="Regular expression pattern"
          />
          <span className="regex-delim" aria-hidden="true">
            /
          </span>
          <input
            id="regex-flags"
            type="text"
            className="regex-input regex-input--flags"
            value={flags}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFlags(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            placeholder="flags"
            data-testid="regex-flags"
            aria-label="Regular expression flags (e.g. g i m s u y d)"
          />
        </div>

        <label htmlFor="regex-sample" className="paste__label">
          Sample text
        </label>
        <textarea
          id="regex-sample"
          className="paste__textarea"
          value={sample}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setSample(e.target.value)}
          spellCheck={false}
          rows={6}
          data-testid="regex-sample"
        />
        <p className="paste__hint">
          Matching runs entirely in your browser with the native RegExp engine. No network, no
          telemetry, no eval.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Regex view mode">
            <legend className="visually-hidden">Regex view mode</legend>
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="regexViewMode"
                  value={m}
                  checked={viewMode === m}
                  onChange={() => setViewMode(m)}
                  data-testid={`regex-view-${m}`}
                />
                {VIEW_LABELS[m]}
              </label>
            ))}
          </fieldset>

          <p
            className="regex-summary"
            data-testid="regex-match-count"
            data-count={matchSet === null ? 0 : matchSet.matchCount}
            role="status"
          >
            {matchSet === null
              ? 'No result.'
              : matchSet.valid
                ? `${matchSet.matchCount} match${matchSet.matchCount === 1 ? '' : 'es'} · ${
                    matchSet.groupCount
                  } capture group${matchSet.groupCount === 1 ? '' : 's'}`
                : 'Invalid pattern.'}
          </p>

          <div className="copy" role="group" aria-label="Copy and export affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={() => handleCopy('matches JSON', parsed.jsonExport)}
              disabled={parsed.jsonExport === null}
              data-testid="regex-copy-json"
            >
              Copy JSON
            </button>
            <button
              type="button"
              className="copy__btn"
              onClick={() => handleCopy('markdown summary', parsed.markdownExport)}
              disabled={parsed.markdownExport === null}
              data-testid="regex-copy-markdown"
            >
              Copy Markdown
            </button>
            <button
              type="button"
              className="copy__btn"
              onClick={() => handleCopy('pattern + flags', parsed.patternExport)}
              disabled={parsed.patternExport === null}
              data-testid="regex-copy-pattern"
            >
              Copy pattern
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="regex-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied ${copyStatus.label} (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        {isProView ? (
          !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="regex-locked">
              <strong>
                {viewMode === 'explain' ? 'Pattern explanation' : 'Redaction recipe'} is a Pro
                feature.
              </strong>
              <p>
                Get a plain-language, structural breakdown of what your pattern matches (named and
                numbered groups, character classes, quantifiers), and generate a declarative JSON
                redaction recipe that masks every match with <code>[REDACTED]</code>. Unlock with a
                license key (verified locally, works offline forever).
              </p>
            </div>
          ) : (
            <pre
              className="toml-output"
              data-testid="regex-output"
              aria-label={`${viewMode} output`}
            >
              {proOutput}
            </pre>
          )
        ) : hasMatches ? (
          <ol className="regex-matches" data-testid="regex-matches" aria-label="Matches">
            {matchSet.matches.map((m) => (
              <li key={m.ordinal} className="regex-match" data-testid="regex-match">
                <div className="regex-match__head">
                  <code className="regex-match__value">
                    {m.value === '' ? '(empty match)' : m.value}
                  </code>
                  <span className="regex-match__span">
                    [{m.start}, {m.end})
                  </span>
                </div>
                {m.groups.length > 0 ? (
                  <ul className="regex-groups">
                    {m.groups.map((g) => (
                      <li key={g.index} className="regex-group" data-testid="regex-group">
                        <span className="regex-group__index">group {g.index}</span>
                        <code className="regex-group__value">{g.value === null ? '∅' : g.value}</code>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {Object.keys(m.namedGroups).length > 0 ? (
                  <ul className="regex-named-groups">
                    {Object.entries(m.namedGroups).map(([name, value]) => (
                      <li
                        key={name}
                        className="regex-named-group"
                        data-testid="regex-named-group"
                      >
                        <span className="regex-named-group__name">&lt;{name}&gt;</span>
                        <code className="regex-named-group__value">
                          {value === null ? '∅' : value}
                        </code>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <div role="status" className="empty-state" data-testid="regex-no-matches">
            {matchSet !== null && !matchSet.valid
              ? 'Fix the pattern or flags to see matches (see diagnostics below).'
              : 'No matches yet. Adjust the pattern, flags, or sample (or check the diagnostics below).'}
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
