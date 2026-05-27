import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import type { CodecName, CodecOperation } from '@nekotools/lens-codec';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { runCodec } from './codec-parse.js';

/**
 * NekoCodec sub-app — vertical-slice UI. Wires `@nekotools/lens-codec` into
 * the shared web-suite shell as a tool tab. Free surface: pick an operation
 * (encode / decode) and a codec (Base64 / Base64URL / URL / Hex), see the
 * transformed output and any validation diagnostics, and copy the output or
 * a JSON / Markdown summary. The shared `ProSurface` (Free/Pro) renders
 * automatically via the tool registry; this component is the panel only.
 */

export interface NekoCodecUiState {
  readonly operation: CodecOperation;
  readonly codec: CodecName;
}

export interface CodecAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoCodecUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
  readonly label: string;
}

const SAMPLE_INPUT = 'NekoTools 🐱 local-first';

const OPERATIONS: ReadonlyArray<{ readonly id: CodecOperation; readonly label: string }> = [
  { id: 'encode', label: 'Encode' },
  { id: 'decode', label: 'Decode' },
];

const CODECS: ReadonlyArray<{ readonly id: CodecName; readonly label: string }> = [
  { id: 'base64', label: 'Base64' },
  { id: 'base64url', label: 'Base64URL' },
  { id: 'url', label: 'URL' },
  { id: 'hex', label: 'Hex' },
];

export function CodecApp({
  initialInput,
  initialUiState,
  clipboardDeps,
}: CodecAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [operation, setOperation] = useState<CodecOperation>(initialUiState?.operation ?? 'encode');
  const [codec, setCodec] = useState<CodecName>(initialUiState?.codec ?? 'base64');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const run = useMemo(() => runCodec(input, operation, codec), [input, operation, codec]);
  const hasOutput = run.output !== null;

  const handleCopy = useCallback(
    async (text: string | null, label: string) => {
      if (text === null) {
        setCopyStatus({ ok: false, method: 'none', label });
        return;
      }
      const result = await copyToClipboard(text, clipboardDeps);
      setCopyStatus({ ok: result.ok, method: result.method, label });
    },
    [clipboardDeps],
  );

  return (
    <section className="tool tool--codec" aria-label="NekoCodec workbench">
      <section className="paste card">
        <label htmlFor="codec-paste" className="paste__label">
          Text to {operation}:
        </label>
        <textarea
          id="codec-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={6}
          data-testid="codec-input"
        />
        <p className="paste__hint">
          Encoding and decoding run entirely in your browser. No network, no telemetry, nothing
          uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Operation">
            <legend className="visually-hidden">Operation</legend>
            {OPERATIONS.map((op) => (
              <label key={op.id} className={operation === op.id ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="codecOperation"
                  value={op.id}
                  checked={operation === op.id}
                  onChange={() => setOperation(op.id)}
                  data-testid={`codec-op-${op.id}`}
                />
                {op.label}
              </label>
            ))}
          </fieldset>

          <fieldset className="viewmode" aria-label="Codec">
            <legend className="visually-hidden">Codec</legend>
            {CODECS.map((c) => (
              <label key={c.id} className={codec === c.id ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="codecName"
                  value={c.id}
                  checked={codec === c.id}
                  onChange={() => setCodec(c.id)}
                  data-testid={`codec-name-${c.id}`}
                />
                {c.label}
              </label>
            ))}
          </fieldset>
        </div>

        <div className="copy" role="group" aria-label="Copy affordances">
          <button
            type="button"
            className="copy__btn"
            onClick={() => void handleCopy(run.output, 'output')}
            disabled={!hasOutput}
            data-testid="codec-copy-output"
          >
            Copy output
          </button>
          <button
            type="button"
            className="copy__btn"
            onClick={() => void handleCopy(run.jsonSummary, 'JSON summary')}
            disabled={run.jsonSummary === null}
            data-testid="codec-copy-json"
          >
            Copy JSON
          </button>
          <button
            type="button"
            className="copy__btn"
            onClick={() => void handleCopy(run.markdownSummary, 'Markdown summary')}
            disabled={run.markdownSummary === null}
            data-testid="codec-copy-markdown"
          >
            Copy Markdown
          </button>
        </div>

        {copyStatus !== null ? (
          <p
            className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
            data-testid="codec-copy-status"
            data-method={copyStatus.method}
            role="status"
          >
            {copyStatus.ok
              ? `Copied ${copyStatus.label} to clipboard (via ${copyStatus.method}).`
              : `Copy failed: nothing to copy for ${copyStatus.label}.`}
          </p>
        ) : null}

        {hasOutput ? (
          <pre
            className="codec-output"
            data-testid="codec-output"
            aria-label={`${operation} output`}
          >
            {run.output}
          </pre>
        ) : (
          <div role="status" className="empty-state" data-testid="codec-no-output">
            No output.{' '}
            {operation === 'decode'
              ? 'The input is not valid for the selected codec — see diagnostics below.'
              : 'Type or paste text above to encode it.'}
          </div>
        )}

        <Diagnostics diagnostics={run.diagnostics} />
      </section>
    </section>
  );
}
