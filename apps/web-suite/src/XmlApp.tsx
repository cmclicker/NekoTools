import { useCallback, useMemo, useState, type ChangeEvent } from 'react';

import type { Entitlement } from '@nekotools/contracts';

import { Diagnostics } from './Diagnostics.js';
import { FileLoadControl } from './FileLoadControl.js';
import { copyToClipboard, type ClipboardDeps } from './clipboard.js';
import { useLicenseContext } from './license-store.js';
import { parseXmlInput } from './xml-parse.js';

/**
 * NekoXML sub-app. Wires `@nekotools/lens-xml` into the shared web-suite
 * shell as another DATA tool tab. Free surface: paste XML, see the element
 * tree as JSON, pretty-print it, read well-formedness diagnostics
 * (mismatched/unclosed tags with line numbers, multiple roots, duplicate
 * attributes, skipped DOCTYPEs), and copy the JSON / pretty XML / markdown
 * summary. Pro (gated by the suite license): a structural XPath path
 * inventory or an inferred W3C XSD. Everything runs locally — NekoXML never
 * resolves a DTD, expands an external entity, or fetches anything (XXE-safe).
 */

export type XmlViewMode = 'json' | 'pretty' | 'markdown' | 'xpath' | 'xsd';

export interface NekoXmlUiState {
  readonly viewMode: XmlViewMode;
}

export interface XmlAppProps {
  readonly initialInput?: string;
  readonly initialUiState?: Partial<NekoXmlUiState>;
  readonly clipboardDeps?: ClipboardDeps;
  /** Injected entitlement; defaults to the suite license context. */
  readonly entitlement?: Entitlement;
}

interface CopyStatus {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'execCommand' | 'none';
}

const PRO_VIEWS = new Set<XmlViewMode>(['xpath', 'xsd']);
const VIEW_MODES: readonly XmlViewMode[] = ['json', 'pretty', 'markdown', 'xpath', 'xsd'];
const VIEW_LABELS: Record<XmlViewMode, string> = {
  json: 'JSON',
  pretty: 'Pretty XML',
  markdown: 'Markdown',
  xpath: 'XPath inventory ⭐',
  xsd: 'XSD ⭐',
};
const COPY_LABELS: Record<XmlViewMode, string> = {
  json: 'Copy JSON',
  pretty: 'Copy pretty XML',
  markdown: 'Copy markdown summary',
  xpath: 'Copy XPath inventory',
  xsd: 'Copy XSD',
};

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

export function XmlApp({
  initialInput,
  initialUiState,
  clipboardDeps,
  entitlement,
}: XmlAppProps = {}): JSX.Element {
  const [input, setInput] = useState<string>(initialInput ?? SAMPLE_INPUT);
  const [viewMode, setViewMode] = useState<XmlViewMode>(initialUiState?.viewMode ?? 'json');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  const license = useLicenseContext();
  const effectiveEntitlement = entitlement ?? license.entitlement;
  const parsed = useMemo(
    () => parseXmlInput(input, effectiveEntitlement),
    [input, effectiveEntitlement],
  );
  const proUnlocked = parsed.proUnlocked;
  const isProView = PRO_VIEWS.has(viewMode);

  const output =
    viewMode === 'json'
      ? parsed.json
      : viewMode === 'pretty'
        ? parsed.pretty
        : viewMode === 'markdown'
          ? parsed.markdown
          : viewMode === 'xpath'
            ? parsed.xpathReport
            : parsed.xsd;
  const copyText = output ?? '';

  const handleCopy = useCallback(async () => {
    if (copyText === '') {
      setCopyStatus({ ok: false, method: 'none' });
      return;
    }
    const result = await copyToClipboard(copyText, clipboardDeps);
    setCopyStatus({ ok: result.ok, method: result.method });
  }, [copyText, clipboardDeps]);

  return (
    <section className="tool tool--xml" aria-label="NekoXML workbench">
      <section className="paste card">
        <div className="paste__head">
          <label htmlFor="xml-paste" className="paste__label">
            Paste XML here:
          </label>
          <FileLoadControl
            onText={(text) => setInput(text)}
            testId="xml-file"
            label="…or load a file"
            ariaLabel="Load a local XML file"
          />
        </div>
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
            {VIEW_MODES.map((m) => (
              <label key={m} className={viewMode === m ? 'viewmode--active' : ''}>
                <input
                  type="radio"
                  name="xmlViewMode"
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
              data-testid="xml-copy-output"
            >
              {COPY_LABELS[viewMode]}
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
          isProView && !proUnlocked ? (
            <div className="pro-lock" role="status" data-testid="xml-locked">
              <strong>
                {viewMode === 'xpath' ? 'XPath path inventory' : 'Inferred XSD'} is a Pro feature.
              </strong>
              <p>
                Generate a structural inventory of every element path, or an inferred W3C XSD from
                the sample document. Unlock with a license key (verified locally, works offline
                forever).
              </p>
            </div>
          ) : (
            <pre className="toml-output" data-testid="xml-output" aria-label={`${viewMode} output`}>
              {output}
            </pre>
          )
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
