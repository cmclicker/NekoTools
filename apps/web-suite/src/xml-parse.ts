import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildXmlRegistration,
  FIXED_CLOCK,
  XML_KIND_PARSED,
  type ParsedXml,
  type XmlElement,
  type XmlParsedArtifact,
} from '@nekotools/lens-xml';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoXML UI parse helper, extracted out of XmlApp for testability — the
 * same engine-adapter seam the other tools' `*-parse.ts` modules provide.
 *
 * Output strings come from the real engine exporters (JSON / pretty /
 * markdown), so the tab can't drift from the engine. The registry is a
 * module singleton so parser identity is stable across re-renders.
 *
 * The Pro XPath-inventory + inferred-XSD exports are gated: `runExporter`
 * throws EntitlementError for a free caller, surfaced here as null so the
 * UI shows the Pro-lock (same pattern as hex-parse.ts / toml-parse.ts).
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
  /** Pro: markdown structural path inventory, or null when not entitled. */
  readonly xpathReport: string | null;
  /** Pro: an inferred W3C XSD for the tree, or null when not entitled. */
  readonly xsd: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

export function parseXmlInput(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedXmlView {
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
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'xml', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

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
    xpathReport: runPro('xml.export.xpath.report'),
    xsd: runPro('xml.export.xsd'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}
