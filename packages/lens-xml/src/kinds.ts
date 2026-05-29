import type { Artifact } from '@nekotools/contracts';

/**
 * NekoXML artifact kinds (all namespaced under `xml.*`; none reused from
 * other tools).
 *
 *   `xml.parsed` — an XML document decoded into a plain, JSON-serializable
 *                  node tree (elements + text), the XML declaration (if
 *                  present), and structural counts. NekoXML never resolves
 *                  a DTD, fetches an external entity, or follows a
 *                  namespace URI — prefixes are kept verbatim as part of
 *                  the element/attribute name.
 */
export const XML_KIND_PARSED = 'xml.parsed';

export const ALL_XML_KINDS = [XML_KIND_PARSED] as const;

/** A decoded element node: tag name, ordered attributes, ordered children. */
export interface XmlElement {
  readonly type: 'element';
  /** Raw tag name including any namespace prefix, e.g. `"svg:rect"`. */
  readonly name: string;
  /** Attributes in source order. Duplicate names keep the first value. */
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
}

/** A decoded text (or CDATA) node. Entities are already decoded. */
export interface XmlText {
  readonly type: 'text';
  readonly value: string;
}

export type XmlNode = XmlElement | XmlText;

/** The `<?xml ... ?>` declaration, when present. */
export interface XmlDeclaration {
  readonly version: string | null;
  readonly encoding: string | null;
  readonly standalone: string | null;
}

/** The parsed body of an `xml.parsed` artifact. */
export interface ParsedXml {
  /** True when the document parsed with no fatal (error) diagnostic. */
  readonly valid: boolean;
  /** The single root element, or `null` when empty / unparsable. */
  readonly root: XmlElement | null;
  /** The XML declaration, or `null` when none was present. */
  readonly declaration: XmlDeclaration | null;
  /** Total count of element nodes in the tree. */
  readonly elementCount: number;
}

export type XmlParsedArtifact = Artifact<'xml.parsed', ParsedXml>;
export type XmlArtifact = XmlParsedArtifact;

/** Exporters render `xml.parsed`; the accept list is narrow on purpose. */
export const XML_PARSED_EXPORT_KINDS = [XML_KIND_PARSED] as const;
