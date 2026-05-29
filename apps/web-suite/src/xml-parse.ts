import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildXmlRegistration,
  FIXED_CLOCK,
  XML_KIND_PARSED,
  type ParsedXml,
  type XmlElement,
  type XmlParsedArtifact,
} from '@nekotools/lens-xml';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoXML UI parse helper, extracted out of XmlApp for testability — the
 * same engine-adapter seam the other tools' `*-parse.ts` modules provide.
 *
 * Output strings come from the real engine exporters (JSON / pretty /
 * markdown), so the tab can't drift from the engine. The registry is a
 * module singleton so parser identity is stable across re-renders.
 */

const SHARED_UTF8_ENCODER = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildXmlRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedXmlView {
  readonly valid: boolean;
  readonly root: XmlElement | null;
  readonly elementCount: number;
  /** Element tree as pretty JSON; `"null"` when empty/unparsable. */
  readonly json: string;
  /** Re-serialized, indented XML; `""` when no root. */
  readonly pretty: string;
  /** Markdown summary of the parse (shape + diagnostics). */
  readonly markdown: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

export function parseXmlInput(raw: string): ParsedXmlView {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'xml', 'xml.text', {
    raw,
    source: { kind: 'paste', bytes },
  });

  const artifact = result.artifacts.find(
    (a): a is XmlParsedArtifact => a.kind === XML_KIND_PARSED,
  );
  const value: ParsedXml | undefined = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };

  const json = artifact
    ? String(runExporter(registry, 'xml', 'xml.export.json', exportInput).body)
    : 'null';
  const pretty = artifact
    ? String(runExporter(registry, 'xml', 'xml.export.pretty', exportInput).body)
    : '';
  const markdown = artifact
    ? String(runExporter(registry, 'xml', 'xml.export.markdown.summary', exportInput).body)
    : '';

  return {
    valid: value?.valid ?? false,
    root: value?.root ?? null,
    elementCount: value?.elementCount ?? 0,
    json,
    pretty,
    markdown,
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}
