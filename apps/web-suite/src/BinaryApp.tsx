import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { runBinary, type BinaryInputMode, type BinarySummary } from './binary-parse.js';

export interface NekoBinaryUiState {
  readonly mode: BinaryInputMode;
}

export interface BinaryAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoBinaryUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

type CopyTarget = 'json' | 'markdown' | 'plaintext';

interface CopyStatus {
  readonly ok: boolean;
  readonly target: CopyTarget;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = '42';

const MODES: ReadonlyArray<{ readonly id: BinaryInputMode; readonly label: string }> = [
  { id: 'decimal', label: 'Decimal' },
  { id: 'binary', label: 'Binary' },
  { id: 'hex', label: 'Hex' },
  { id: 'base64', label: 'Base64' },
  { id: 'utf8', label: 'UTF-8' },
];

export function BinaryApp({
  initialInput,
  initialUiState,
  clipboardDeps,
}: BinaryAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [mode, setMode] = useState<BinaryInputMode>(initialUiState?.mode ?? 'decimal');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const run = useMemo(() => runBinary(input, mode), [input, mode]);

  const handleCopy = useCallback(
    async (target: CopyTarget) => {
      const text =
        target === 'json'
          ? run.jsonExport
          : target === 'markdown'
            ? run.markdownExport
            : run.plaintextExport;
      const result = await copyToClipboard(text, clipboardDeps);
      setCopyStatus({ ok: result.ok, target, method: result.method });
    },
    [clipboardDeps, run.jsonExport, run.markdownExport, run.plaintextExport],
  );

  return (
    <section className="tool tool--binary" aria-label="NekoBinary workbench">
      <section className="paste card">
        <label htmlFor="binary-paste" className="paste__label">
          Paste {labelForMode(mode)}:
        </label>
        <textarea
          id="binary-paste"
          className="paste__textarea"
          value={input}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setInput(event.target.value)}
          spellCheck={false}
          rows={6}
          data-testid="binary-input"
        />
        <p className="paste__hint">
          Conversion runs in your browser with no registry calls, telemetry, or remote fetches.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="Binary input mode">
            <legend className="visually-hidden">Binary input mode</legend>
            {MODES.map((item) => (
              <label key={item.id} className={mode === item.id ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="binaryMode"
                  value={item.id}
                  checked={mode === item.id}
                  onChange={() => setMode(item.id)}
                  data-testid={`binary-mode-${item.id}`}
                />
                {item.label}
              </label>
            ))}
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={() => void handleCopy('json')}
              data-testid="binary-copy-json"
            >
              Copy JSON
            </button>
            <button
              type="button"
              className="copy__btn"
              onClick={() => void handleCopy('markdown')}
              data-testid="binary-copy-markdown"
            >
              Copy Markdown
            </button>
            <button
              type="button"
              className="copy__btn"
              onClick={() => void handleCopy('plaintext')}
              data-testid="binary-copy-plaintext"
            >
              Copy Text
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="binary-copy-status"
              data-target={copyStatus.target}
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied ${copyStatus.target} export to clipboard (via ${copyStatus.method}).`
                : `Copy failed for ${copyStatus.target}.`}
            </p>
          ) : null}
        </div>

        {run.summary === null ? (
          <div role="status" className="empty-state" data-testid="binary-no-output">
            No artifact produced. Check diagnostics below.
          </div>
        ) : (
          <BinarySummaryView summary={run.summary} inputBytes={run.inputBytes} />
        )}

        <Diagnostics diagnostics={run.diagnostics} />
      </section>
    </section>
  );
}

function BinarySummaryView({
  summary,
  inputBytes,
}: {
  readonly summary: BinarySummary;
  readonly inputBytes: number;
}): JSX.Element {
  if (summary.kind === 'number') {
    return (
      <dl className="kv binary-summary" data-testid="binary-output">
        <dt>Artifact</dt>
        <dd>binary.number</dd>
        <dt>Input bytes</dt>
        <dd>{inputBytes}</dd>
        <dt>Decimal</dt>
        <dd>
          <code>{summary.decimal}</code>
        </dd>
        <dt>Hex</dt>
        <dd>
          <code>{summary.hex}</code>
        </dd>
        <dt>Binary</dt>
        <dd>
          <code>{summary.binary}</code>
        </dd>
      </dl>
    );
  }

  if (summary.kind === 'bytes') {
    return (
      <dl className="kv binary-summary" data-testid="binary-output">
        <dt>Artifact</dt>
        <dd>binary.bytes</dd>
        <dt>Input bytes</dt>
        <dd>{inputBytes}</dd>
        <dt>Byte count</dt>
        <dd>{summary.byteCount}</dd>
        <dt>Hex</dt>
        <dd>
          <code>{summary.hex}</code>
        </dd>
        <dt>UTF-8 preview</dt>
        <dd className="binary-preview">{summary.utf8Preview}</dd>
      </dl>
    );
  }

  return (
    <dl className="kv binary-summary" data-testid="binary-output">
      <dt>Artifact</dt>
      <dd>binary.text</dd>
      <dt>Input bytes</dt>
      <dd>{inputBytes}</dd>
      <dt>Byte count</dt>
      <dd>{summary.byteCount}</dd>
      <dt>Hex</dt>
      <dd>
        <code>{summary.hex}</code>
      </dd>
      <dt>Text</dt>
      <dd className="binary-preview">{summary.text}</dd>
    </dl>
  );
}

function labelForMode(mode: BinaryInputMode): string {
  switch (mode) {
    case 'decimal':
      return 'a non-negative decimal integer';
    case 'binary':
      return 'binary digits';
    case 'hex':
      return 'hex bytes';
    case 'base64':
      return 'Base64';
    case 'utf8':
      return 'UTF-8 text';
  }
}
