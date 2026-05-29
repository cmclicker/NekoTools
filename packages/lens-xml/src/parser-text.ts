import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { XML_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  XML_KIND_PARSED,
  type ParsedXml,
  type XmlArtifact,
  type XmlDeclaration,
  type XmlElement,
  type XmlNode,
  type XmlParsedArtifact,
} from './kinds.js';

const TOOL_ID = 'xml';
const PARSER_ID = 'xml.text';

export interface XmlTextParserDeps {
  readonly clock: Clock;
}

interface MutableElement {
  type: 'element';
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
}

/**
 * The `xml.text` parser. Decodes an XML document into a JSON-serializable
 * node tree and never throws — malformed markup produces structured
 * diagnostics (with line numbers) and a best-effort (`valid: false`)
 * artifact.
 *
 * Security: NekoXML is a pure string parser. It never resolves a DTD,
 * expands an external entity, or fetches a namespace URI — a `<!DOCTYPE>`
 * is skipped and flagged `xml.external_entity`. This sidesteps the entire
 * XXE / billion-laughs class of attacks by construction.
 */
export function createXmlTextParser(deps: XmlTextParserDeps): Parser<XmlArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [XML_KIND_PARSED],
    parse(input: ParserInput): ParserResult<XmlArtifact> {
      return parseXmlText(input, deps);
    },
  };
}

const BUILTIN_ENTITIES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  apos: "'",
  quot: '"',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9.-]*);/g, (m, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const cp = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isNaN(cp)) return m;
      try {
        return String.fromCodePoint(cp);
      } catch {
        return m;
      }
    }
    return BUILTIN_ENTITIES[body] ?? m;
  });
}

function parseXmlText(input: ParserInput, deps: XmlTextParserDeps): ParserResult<XmlArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const producedAt = deps.clock.now();
  const diagnostics: Diagnostic[] = [];

  let raw = input.raw;
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // strip BOM

  if (raw.trim() === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', XML_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return { artifacts: [makeArtifact(artIds(), producedAt, input, invalidValue())], diagnostics };
  }

  const n = raw.length;
  let i = 0;
  let fatal = false;
  let declaration: XmlDeclaration | null = null;
  let root: MutableElement | null = null;
  let rootCount = 0;
  let elementCount = 0;
  let warnedExternal = false;
  const stack: MutableElement[] = [];

  const lineAt = (idx: number): number => {
    let line = 1;
    for (let k = 0; k < idx && k < n; k++) if (raw[k] === '\n') line += 1;
    return line;
  };
  const err = (idx: number, code: string, message: string): void => {
    diagnostics.push(makeDiagnostic(diagIds(), 'error', code, `line ${lineAt(idx)}: ${message}`));
    fatal = true;
  };
  const warn = (idx: number, code: string, message: string, hint?: string): void => {
    diagnostics.push(makeDiagnostic(diagIds(), 'warning', code, `line ${lineAt(idx)}: ${message}`, undefined, hint));
  };

  while (i < n) {
    if (raw[i] !== '<') {
      const start = i;
      while (i < n && raw[i] !== '<') i += 1;
      const text = raw.slice(start, i);
      if (stack.length > 0) {
        stack[stack.length - 1]!.children.push({ type: 'text', value: decodeEntities(text) });
      } else if (text.trim() !== '') {
        err(start, XML_DIAGNOSTIC_CODES.parseError, 'character data outside the root element');
      }
      continue;
    }

    // raw[i] === '<'
    if (raw.startsWith('<!--', i)) {
      const end = raw.indexOf('-->', i + 4);
      if (end < 0) {
        err(i, XML_DIAGNOSTIC_CODES.parseError, 'unterminated comment');
        break;
      }
      i = end + 3;
      continue;
    }
    if (raw.startsWith('<![CDATA[', i)) {
      const end = raw.indexOf(']]>', i + 9);
      if (end < 0) {
        err(i, XML_DIAGNOSTIC_CODES.parseError, 'unterminated CDATA section');
        break;
      }
      if (stack.length > 0) {
        stack[stack.length - 1]!.children.push({ type: 'text', value: raw.slice(i + 9, end) });
      }
      i = end + 3;
      continue;
    }
    if (raw.startsWith('<?', i)) {
      const end = raw.indexOf('?>', i + 2);
      if (end < 0) {
        err(i, XML_DIAGNOSTIC_CODES.parseError, 'unterminated processing instruction');
        break;
      }
      const content = raw.slice(i + 2, end).trim();
      if (declaration === null && root === null && /^xml(\s|$)/i.test(content)) {
        declaration = parseDeclaration(content);
      }
      i = end + 2;
      continue;
    }
    if (raw.startsWith('<!', i)) {
      // DOCTYPE / markup declaration — skipped, never resolved.
      if (!warnedExternal) {
        warn(
          i,
          XML_DIAGNOSTIC_CODES.externalEntity,
          'DOCTYPE / markup declaration skipped',
          'NekoXML never resolves DTDs or external entities (XXE-safe by construction).',
        );
        warnedExternal = true;
      }
      i = skipDoctype(raw, i);
      continue;
    }
    if (raw.startsWith('</', i)) {
      const end = raw.indexOf('>', i + 2);
      if (end < 0) {
        err(i, XML_DIAGNOSTIC_CODES.parseError, 'unterminated end tag');
        break;
      }
      const name = raw.slice(i + 2, end).trim();
      const open = stack.pop();
      if (open === undefined) {
        err(i, XML_DIAGNOSTIC_CODES.parseError, `unexpected end tag </${name}>`);
      } else if (open.name !== name) {
        err(i, XML_DIAGNOSTIC_CODES.mismatchedTag, `expected </${open.name}> but found </${name}>`);
      }
      i = end + 1;
      continue;
    }

    // start tag
    const tagStart = i;
    i += 1; // past '<'
    const nameStart = i;
    while (i < n && !/[\s/>]/.test(raw[i]!)) i += 1;
    const name = raw.slice(nameStart, i);
    if (name === '') {
      err(tagStart, XML_DIAGNOSTIC_CODES.parseError, 'malformed start tag (missing element name)');
      i += 1;
      continue;
    }

    const attrResult = parseAttributes(raw, i, tagStart, diagIds, diagnostics, lineAt);
    if (attrResult === null) {
      err(tagStart, XML_DIAGNOSTIC_CODES.parseError, `unterminated start tag <${name}>`);
      break;
    }
    const { attributes, end, selfClosing } = attrResult;
    i = end;

    const el: MutableElement = { type: 'element', name, attributes, children: [] };
    elementCount += 1;

    if (stack.length > 0) {
      stack[stack.length - 1]!.children.push(el);
    } else {
      rootCount += 1;
      if (root === null) {
        root = el;
      } else if (rootCount === 2) {
        warn(tagStart, XML_DIAGNOSTIC_CODES.multipleRoots, 'document has more than one root element');
      }
    }
    if (!selfClosing) stack.push(el);
  }

  if (stack.length > 0 && !fatal) {
    const open = stack[stack.length - 1]!;
    err(n, XML_DIAGNOSTIC_CODES.unclosedTag, `element <${open.name}> is never closed`);
  }

  const value: ParsedXml = {
    valid: !fatal,
    root: root as XmlElement | null,
    declaration,
    elementCount,
  };
  return { artifacts: [makeArtifact(artIds(), producedAt, input, value)], diagnostics };
}

interface AttrResult {
  readonly attributes: Record<string, string>;
  readonly end: number;
  readonly selfClosing: boolean;
}

function parseAttributes(
  raw: string,
  from: number,
  tagStart: number,
  diagIds: () => string,
  diagnostics: Diagnostic[],
  lineAt: (idx: number) => number,
): AttrResult | null {
  const n = raw.length;
  let i = from;
  const attributes: Record<string, string> = {};
  const seen = new Set<string>();

  for (;;) {
    while (i < n && /\s/.test(raw[i]!)) i += 1;
    if (i >= n) return null;
    if (raw[i] === '>') return { attributes, end: i + 1, selfClosing: false };
    if (raw[i] === '/' && raw[i + 1] === '>') return { attributes, end: i + 2, selfClosing: true };

    const nameStart = i;
    while (i < n && !/[\s=/>]/.test(raw[i]!)) i += 1;
    const attrName = raw.slice(nameStart, i);
    if (attrName === '') return null;

    while (i < n && /\s/.test(raw[i]!)) i += 1;
    if (raw[i] !== '=') {
      // Valueless attribute — tolerate by treating value as empty string.
      if (!seen.has(attrName)) {
        attributes[attrName] = '';
        seen.add(attrName);
      }
      continue;
    }
    i += 1; // past '='
    while (i < n && /\s/.test(raw[i]!)) i += 1;
    const quote = raw[i];
    if (quote !== '"' && quote !== "'") return null;
    i += 1;
    const valStart = i;
    while (i < n && raw[i] !== quote) i += 1;
    if (i >= n) return null;
    const value = decodeEntities(raw.slice(valStart, i));
    i += 1; // past closing quote

    if (seen.has(attrName)) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          XML_DIAGNOSTIC_CODES.duplicateAttribute,
          `line ${lineAt(tagStart)}: attribute "${attrName}" repeats; keeping the first value`,
        ),
      );
    } else {
      attributes[attrName] = value;
      seen.add(attrName);
    }
  }
}

/** Skip a `<!DOCTYPE ...>` (including a `[...]` internal subset) without resolving it. */
function skipDoctype(raw: string, from: number): number {
  const n = raw.length;
  let i = from;
  let bracket = 0;
  while (i < n) {
    const ch = raw[i];
    if (ch === '[') bracket += 1;
    else if (ch === ']') bracket -= 1;
    else if (ch === '>' && bracket <= 0) return i + 1;
    i += 1;
  }
  return n;
}

function parseDeclaration(content: string): XmlDeclaration {
  const pick = (attr: string): string | null => {
    const m = new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`).exec(content);
    return m ? (m[1] ?? null) : null;
  };
  return { version: pick('version'), encoding: pick('encoding'), standalone: pick('standalone') };
}

function invalidValue(): ParsedXml {
  return { valid: false, root: null, declaration: null, elementCount: 0 };
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: ParsedXml,
): XmlParsedArtifact {
  return {
    version: 1,
    kind: XML_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
