import type { Exporter } from '@nekotools/contracts';

import {
  XML_KIND_PARSED,
  XML_PARSED_EXPORT_KINDS,
  type ParsedXml,
  type XmlArtifact,
  type XmlElement,
  type XmlParsedArtifact,
} from './kinds.js';

const TOOL_ID = 'xml';

function pickParsed(artifacts: readonly XmlArtifact[]): XmlParsedArtifact | undefined {
  return artifacts.find((a): a is XmlParsedArtifact => a.kind === XML_KIND_PARSED);
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** Convert an element tree to a conventional JSON object: `@attr` for
 * attributes, `#text` for mixed text, repeated child tags collapse into
 * arrays, and a pure-text leaf becomes its string value. */
function elementToJson(el: XmlElement): unknown {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(el.attributes)) obj[`@${k}`] = v;

  const texts: string[] = [];
  const groups = new Map<string, unknown[]>();
  for (const child of el.children) {
    if (child.type === 'text') {
      const t = child.value.trim();
      if (t !== '') texts.push(t);
    } else {
      const arr = groups.get(child.name) ?? [];
      arr.push(elementToJson(child));
      groups.set(child.name, arr);
    }
  }

  const text = texts.join(' ');
  if (groups.size === 0 && Object.keys(el.attributes).length === 0) {
    return text;
  }
  for (const [name, arr] of groups) obj[name] = arr.length === 1 ? arr[0] : arr;
  if (text !== '') obj['#text'] = text;
  return obj;
}

function serializeElement(el: XmlElement, indent: number): string {
  const pad = '  '.repeat(indent);
  const attrs = Object.entries(el.attributes)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('');

  const meaningful = el.children.filter(
    (c) => c.type === 'element' || (c.type === 'text' && c.value.trim() !== ''),
  );
  if (meaningful.length === 0) return `${pad}<${el.name}${attrs}/>`;

  if (meaningful.length === 1 && meaningful[0]!.type === 'text') {
    const t = (meaningful[0] as { value: string }).value.trim();
    return `${pad}<${el.name}${attrs}>${escapeText(t)}</${el.name}>`;
  }

  const lines = [`${pad}<${el.name}${attrs}>`];
  for (const child of meaningful) {
    if (child.type === 'element') lines.push(serializeElement(child, indent + 1));
    else lines.push(`${pad}  ${escapeText(child.value.trim())}`);
  }
  lines.push(`${pad}</${el.name}>`);
  return lines.join('\n');
}

/**
 * `xml.export.json` — the element tree as pretty JSON (attributes under
 * `@name`, mixed text under `#text`, repeated tags as arrays).
 */
export const jsonExporter: Exporter<XmlArtifact> = {
  version: 1,
  id: 'xml.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: XML_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const root = pickParsed(artifacts)?.value.root ?? null;
    const out = root === null ? null : { [root.name]: elementToJson(root) };
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(out, null, 2) };
  },
};

/**
 * `xml.export.pretty` — the document re-serialized with 2-space
 * indentation. Empty string when there is no root element.
 */
export const prettyExporter: Exporter<XmlArtifact> = {
  version: 1,
  id: 'xml.export.pretty',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: XML_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/xml',
  producesExtension: 'xml',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value;
    if (value === undefined || value.root === null) {
      return { mimeType: 'application/xml', extension: 'xml', body: '' };
    }
    const decl = value.declaration;
    const prefix =
      decl === null
        ? ''
        : `<?xml version="${decl.version ?? '1.0'}"${
            decl.encoding ? ` encoding="${decl.encoding}"` : ''
          }${decl.standalone ? ` standalone="${decl.standalone}"` : ''}?>\n`;
    return {
      mimeType: 'application/xml',
      extension: 'xml',
      body: prefix + serializeElement(value.root, 0),
    };
  },
};

/**
 * `xml.export.markdown.summary` — document shape (root, element count,
 * declaration), top-level child tags, and diagnostics.
 */
export const markdownSummaryExporter: Exporter<XmlArtifact> = {
  version: 1,
  id: 'xml.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: XML_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const value: ParsedXml | undefined = pickParsed(artifacts)?.value;
    const lines: string[] = ['# NekoXML export', '', '## Document', ''];

    if (value === undefined || value.root === null) {
      lines.push('- valid: no (no root element)');
    } else {
      lines.push(
        `- valid: ${value.valid ? 'yes' : 'no'}`,
        `- root: \`${value.root.name}\``,
        `- elements: ${value.elementCount}`,
      );
      if (value.declaration !== null) {
        const d = value.declaration;
        lines.push(`- declaration: version ${d.version ?? '?'}${d.encoding ? `, encoding ${d.encoding}` : ''}`);
      }
      const childTags = value.root.children
        .filter((c): c is XmlElement => c.type === 'element')
        .map((c) => c.name);
      if (childTags.length > 0) {
        lines.push('', '## Root children', '');
        for (const tag of childTags) lines.push(`- \`${tag}\``);
      }
    }

    if (diagnostics.length > 0) {
      lines.push('', '## Diagnostics', '');
      for (const d of diagnostics) {
        lines.push(`- **${d.severity.toUpperCase()}** \`${d.code}\` — ${d.message}`);
      }
    }

    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<XmlArtifact>[] = [
  jsonExporter,
  prettyExporter,
  markdownSummaryExporter,
];
