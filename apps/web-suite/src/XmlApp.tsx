import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import { Diagnostics } from './Diagnostics.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { parseXmlInput } from './xml-parse.js';

/**
 * NekoXML sub-app. Wires `@nekotools/lens-xml` into the shared web-suite
 * shell as another DATA tool tab. Free surface: paste XML, see the element
 * tree as JSON, pretty-print it, read well-formedness diagnostics
 * (mismatched/unclosed tags with line numbers, multiple roots, duplicate
 * attributes, skipped DOCTYPEs), and copy the JSON / pretty XML / markdown
 * summary. Everything runs locally — NekoXML never resolves a DTD,
 * expands an external entity, or fetches anything (XXE-safe).
 */

export type XmlViewMode = 'json' | 'pretty' | 'markdown';

export interface NekoXmlUiState {
  readonly viewMode: XmlViewMode;
}

export interface XmlAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoXmlUiState>;
  readonly clipboardDeps?: ClipboardDeps;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const SAMPLE_INPUT = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<catalog>',
  '  <book id="bk101" lang="en">',
  '    <title>NekoXML &amp; friends</title>',
  '    <price>9.99</price>',
  '  </book>',
  '  <book id="bk102">',
  '    <title>Local-First Tools</title>',
  '  </book>',
  '</catalog>',
].join('\n');

function copyLabel(mode: XmlViewMode): string {
  if (mode === 'json') return 'Copy JSON';
  if (mode === 'pretty') return 'Copy pretty XML';
  return 'Copy markdown summary';
}

export function XmlApp({ initialInput, initialUiState, clipboardDeps }: XmlAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<XmlViewMode>(initialUiState?.viewMode ?? 'json');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const parsed = useMemo(() => parseXmlInput(input), [input]);

  const output =
    viewMode === 'json' ? parsed.json : viewMode === 'pretty' ? parsed.pretty : parsed.markdown;

  const handleCopy = useCallback(async () => {
    if (output === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const result = await copyToClipboard(output, clipboardDeps);
    setCopyStatus({ ok: result.ok, method: result.method });
  }, [output, clipboardDeps]);

  return (
    <section className="tool tool--xml" aria-label="NekoXML workbench">
      <section className="paste card">
        <label htmlFor="xml-paste" className="paste__label">
          Paste XML here:
        </label>
        <textarea
          id="xml-paste"
          className="paste__textarea"
          value={input}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          spellCheck={false}
          rows={10}
          data-testid="xml-input"
        />
        <p className="paste__hint">
          Parsing runs entirely in your browser. No DTD resolution, no external entities, no
          network, nothing uploaded.
        </p>
      </section>

      <section className="results card">
        <div className="results__toolbar">
          <fieldset className="viewmode" aria-label="XML output mode">
            <legend className="visually-hidden">XML output mode</legend>
            <label className={viewMode === 'json' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="xmlViewMode"
                value="json"
                checked={viewMode === 'json'}
                onChange={() => setViewMode('json')}
              />
              JSON
            </label>
            <label className={viewMode === 'pretty' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="xmlViewMode"
                value="pretty"
                checked={viewMode === 'pretty'}
                onChange={() => setViewMode('pretty')}
              />
              Pretty XML
            </label>
            <label className={viewMode === 'markdown' ? 'viewmode--active' : ''}>
              <input
                type="radio"
                name="xmlViewMode"
                value="markdown"
                checked={viewMode === 'markdown'}
                onChange={() => setViewMode('markdown')}
              />
              Markdown
            </label>
          </fieldset>

          <div className="copy" role="group" aria-label="Copy affordances">
            <button
              type="button"
              className="copy__btn"
              onClick={handleCopy}
              disabled={output === ''}
              data-testid="xml-copy-output"
            >
              {copyLabel(viewMode)}
            </button>
          </div>

          {copyStatus !== null ? (
            <p
              className={`copy__status copy__status--${copyStatus.ok ? 'ok' : 'fail'}`}
              data-testid="xml-copy-status"
              data-method={copyStatus.method}
              role="status"
            >
              {copyStatus.ok
                ? `Copied to clipboard (via ${copyStatus.method}).`
                : 'Copy failed: nothing to copy.'}
            </p>
          ) : null}
        </div>

        <ul className="toml-stats" data-testid="xml-stats">
          <li>
            valid: <strong data-testid="xml-stat-valid">{parsed.valid ? 'yes' : 'no'}</strong>
          </li>
          <li>
            root: <strong data-testid="xml-stat-root">{parsed.root?.name ?? '(none)'}</strong>
          </li>
          <li>
            elements: <strong data-testid="xml-stat-elements">{parsed.elementCount}</strong>
          </li>
        </ul>

        {parsed.root !== null ? (
          <pre className="toml-output" data-testid="xml-output" aria-label={`${viewMode} output`}>
            {output}
          </pre>
        ) : (
          <div role="status" className="empty-state" data-testid="xml-no-document">
            No XML decoded yet. Paste a document above (or check the diagnostics below).
          </div>
        )}

        <Diagnostics diagnostics={parsed.diagnostics} />
      </section>
    </section>
  );
}
