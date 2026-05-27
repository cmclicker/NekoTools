import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps, type CopyMethod } from './clipboard.js';
import { runRegex } from './regex-parse.js';

/**
 * NekoRegex sub-app — Free vertical slice UI. Wires `@nekotools/lens-regex`
 * into the shared web-suite shell as a tool tab. Type a pattern + flags,
 * paste sample text, and see the match count, every match with its offsets,
 * numbered + named capture groups, plus safety diagnostics. The shared
 * `ProSurface` (Free/Pro) renders automatically via the tool registry; this
 * component is the panel only. Native RegExp only — no eval, no network.
 */

export interface RegexAppProps {
  readonly initialPattern?: string;
  readonly initialFlags?: string;
  readonly initialSample?: string;
  readonly clipboardDeps?: ClipboardDeps;
}

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
  clipboardDeps,
}: RegexAppProps = {}): JSX.Element {
  const [pattern, setPattern] = useState<string>(initialPattern ?? SAMPLE_PATTERN);
  const [flags, setFlags] = useState<string>(initialFlags ?? SAMPLE_FLAGS);
  const [sample, setSample] = useState<string>(initialSample ?? SAMPLE_TEXT);
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => runRegex(pattern, flags, sample), [pattern, flags, sample]);
  const matchSet = parsed.matchSet;

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

        {hasMatches ? (
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
