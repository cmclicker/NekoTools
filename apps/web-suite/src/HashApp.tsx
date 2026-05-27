import { useCallback, useEffect, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { hashBytes, hashText, type HashRunnerDeps, type ParsedHash } from './hash-parse.js';
import type { Diagnostic } from '@nekotools/contracts';
import type { HashAlgorithm } from '@nekotools/lens-hash';

/**
 * NekoHash sub-app. Wires `@nekotools/lens-hash` into the shared web-suite
 * shell as a tool tab. Hash pasted text or a chosen file locally with
 * SHA-256/384/512; see the hex + base64 digest, the input byte length, and
 * the selected algorithm; copy the raw digest / a JSON summary / a Markdown
 * summary. The shared `ProSurface` (Free/Pro) renders automatically via the
 * tool registry; this component is the panel only.
 *
 * Hashing is async (Web Crypto `crypto.subtle.digest`), so the digest is
 * computed in an effect. `hashDeps.subtle` is injectable so tests do not
 * depend on the jsdom crypto implementation.
 */

export type HashSourceMode = 'text' | 'file';
export type { HashRunnerDeps } from './hash-parse.js';

export interface NekoHashUiState {
  readonly algorithm: HashAlgorithm;
}

export interface HashAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoHashUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  readonly hashDeps?: HashRunnerDeps;
}

type CopyTarget = 'digest' | 'json' | 'markdown';

interface CopyStatus {
  readonly ok: boolean;
  readonly target: CopyTarget;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const ALGORITHMS: readonly HashAlgorithm[] = ['SHA-256', 'SHA-384', 'SHA-512'];

const SAMPLE_INPUT = 'The quick brown fox jumps over the lazy dog';

const EMPTY_PARSED: ParsedHash = {
  digest: null,
  hex: null,
  base64: null,
  jsonSummary: null,
  markdownSummary: null,
  inputBytes: 0,
  algorithm: 'SHA-256',
  diagnostics: [],
};

export function HashApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  hashDeps,
}: HashAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [algorithm, setAlgorithm] = useState<HashAlgorithm>(initialUiState?.algorithm ?? 'SHA-256');
  const [mode, setMode] = useState<HashSourceMode>('text');
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedHash>(EMPTY_PARSED);
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  // Recompute the digest whenever the input, file, or algorithm changes.
  // digestBytes reports failures via diagnostics rather than throwing; the
  // try/catch is a final guard against an unexpected Web Crypto rejection so
  // a hidden, never-interacted panel can never raise an unhandled rejection.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result =
          mode === 'file' && fileBytes !== null
            ? await hashBytes(
                fileBytes,
                algorithm,
                { kind: 'file', bytes: fileBytes.byteLength, filename: fileName ?? 'file' },
                hashDeps,
              )
            : await hashText(input, algorithm, hashDeps);
        if (!cancelled) setParsed(result);
      } catch {
        if (!cancelled) setParsed({ ...EMPTY_PARSED, algorithm });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, input, algorithm, fileBytes, fileName, hashDeps]);

  const handleTextChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    setMode('text');
    setFileError(null);
  }, []);

  const handleFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    setFileError(null);
    try {
      const buffer = await file.arrayBuffer();
      setFileBytes(new Uint8Array(buffer));
      setFileName(file.name);
      setMode('file');
    } catch {
      // File API read failure — surfaced as a diagnostic without switching
      // the displayed result.
      setFileError(file.name);
    }
  }, []);

  const handleCopy = useCallback(
    async (target: CopyTarget) => {
      const text =
        target === 'digest'
          ? parsed.hex
          : target === 'json'
            ? parsed.jsonSummary
            : parsed.markdownSummary;
      if (text === null) {
        setCopyStatus({ ok: false, target, method: 'none' });
        return;
      }
      const result = await copyToClipboard(text, clipboardDeps);
      setCopyStatus({ ok: result.ok, target, method: result.method });
    },
    [parsed, clipboardDeps],
  );

  const fileDiagnostic: Diagnostic | null =
    fileError !== null
      ? {
          version: 1,
          id: 'diag_file_read',
          severity: 'error',
          code: 'hash.file_read_failure',
          message: `could not read file "${fileError}"`,
        }
      : null;
  const diagnostics =
    fileDiagnostic !== null ? [fileDiagnostic, ...parsed.diagnostics] : parsed.diagnostics;

  const hasDigest = parsed.hex !== null;

  return (
    <section className="tool tool--hash" aria-label="NekoHash workbench">
      <section className="paste card">
        <label htmlFor="hash-paste" className="paste__label">
          Paste text to hash:
        </label>
        <textarea
          id="hash-paste"
          className="paste__textarea"
          value={input}
          onChange={handleTextChange}
          spellCheck={false}
          rows={6}
          data-testid="hash-input"
        />
        <div className="paste__file">
          <label htmlFor="hash-file">…or hash a file:</label>
          <input id="hash-file" type="file" onChange={handleFile} data-testid="hash-file" />
          {mode === 'file' && fileName !== null ? (
            <span className="paste__filename" data-testid="hash-filename">
              {fileName}
            </span>
          ) : null}
        </div>
        <p className="paste__hint">
          Hashing runs entirely in your browser via the Web Crypto API. No network, no telemetry,
          nothing uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="algorithm" aria-label="Hash algorithm">
            <legend className="visually-hidden">Hash algorithm</legend>
            {ALGORITHMS.map((algo) => (
              <label key={algo} className={algorithm === algo ? 'algorithm--active' : ''}>
                <input
                  type="radio"
                  name="hashAlgorithm"
                  value={algo}
                  checked={algorithm === algo}
                  onChange={() => setAlgorithm(algo)}
                />
                {algo}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={() => void handleCopy('digest')}
              disabled={!hasDigest}
              data-testid="hash-copy-digest"
            >
              Copy digest
            </button>
            <button
              type="button"
              className="copy__btn"
              onClick={() => void handleCopy('json')}
              disabled={!hasDigest}
              data-testid="hash-copy-json"
            >
              Copy JSON
            </button>
            <button
              type="button"
              className="copy__btn"
              onClick={() => void handleCopy('markdown')}
              disabled={!hasDigest}
              data-testid="hash-copy-markdown"
            >
              Copy Markdown
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="hash-copy-status"
              data-target={copyStatus.target}
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied ${copyStatus.target} to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy yet.'}
            </p>
          ) : null}
        </div>

        {hasDigest ? (
          <dl className="hash-digest" data-testid="hash-output">
            <dt>Algorithm</dt>
            <dd data-testid="hash-algorithm">{parsed.algorithm}</dd>
            <dt>Input bytes</dt>
            <dd data-testid="hash-bytes">{parsed.inputBytes}</dd>
            <dt>Hex</dt>
            <dd className="hash-digest__hex" data-testid="hash-hex">
              {parsed.hex}
            </dd>
            <dt>Base64</dt>
            <dd className="hash-digest__base64" data-testid="hash-base64">
              {parsed.base64}
            </dd>
          </dl>
        ) : (
          <div role="status" className="empty-state" data-testid="hash-no-digest">
            No digest yet. Paste text or choose a file above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={diagnostics} />
      </section>
    </section>
  );
}
