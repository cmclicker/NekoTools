import type { ParsedXml, XmlElement } from './kinds.js';

/**
 * NekoXML Pro generators. Back the declared Pro exporters
 * `xml.export.xpath.report` (pro entitlement `query.xpath`) and
 * `xml.export.xsd` (pro entitlement `validate.xsd` / `infer.schema`).
 *
 * Both are pure, deterministic walks of the parsed `xml.parsed` node tree —
 * no network, no clock, no premium engine, no DTD/entity resolution.
 *
 * Scope boundary (matches the manifest's out-of-scope list):
 *   - `xpath.report` is a STRUCTURAL PATH INVENTORY — the distinct element
 *     paths present in the document with occurrence counts. It is NOT XPath
 *     query *evaluation* (that stays advertising-only). Think "what paths
 *     exist", not "evaluate this expression".
 *   - `xsd` GENERATES an inferred schema from the observed structure. It is
 *     NOT XSD *validation* of the document against an external schema (that
 *     stays advertising-only).
 */

interface PathStat {
  /** Element path like `/root/item/name`. */
  readonly path: string;
  count: number;
  hasText: boolean;
  readonly attributes: Set<string>;
}

/** Walk the tree accumulating per-path structural stats, in first-seen order. */
function collectPaths(root: XmlElement): PathStat[] {
  const order: string[] = [];
  const byPath = new Map<string, PathStat>();

  const visit = (el: XmlElement, parentPath: string): void => {
    const path = `${parentPath}/${el.name}`;
    let stat = byPath.get(path);
    if (stat === undefined) {
      stat = { path, count: 0, hasText: false, attributes: new Set() };
      byPath.set(path, stat);
      order.push(path);
    }
    stat.count += 1;
    for (const a of Object.keys(el.attributes)) stat.attributes.add(a);
    for (const child of el.children) {
      if (child.type === 'text') {
        if (child.value.trim() !== '') stat.hasText = true;
      } else {
        visit(child, path);
      }
    }
  };

  visit(root, '');
  return order.map((p) => byPath.get(p)!);
}

// --- xpath.report ----------------------------------------------------------

function escapePipe(s: string): string {
  return s.replace(/\|/g, '\\|');
}

/**
 * `xml.export.xpath.report` — a structural inventory of every distinct
 * element path in the document: the path, how many times it occurs, whether
 * it carries text, and the attribute names seen on it. A path-existence map,
 * not a query engine.
 */
export function toXPathReport(xml: ParsedXml): string {
  const out: string[] = ['# NekoXML path inventory', ''];
  if (xml.root === null) {
    out.push('(no root element)');
    return out.join('\n');
  }
  const stats = collectPaths(xml.root);
  out.push(
    `- root: \`${xml.root.name}\``,
    `- elements: ${xml.elementCount}`,
    `- distinct paths: ${stats.length}`,
    '',
    '| path | count | text | attributes |',
    '| --- | --- | --- | --- |',
  );
  for (const s of stats) {
    const attrs = [...s.attributes].sort().map((a) => `@${a}`).join(', ');
    out.push(`| \`${s.path}\` | ${s.count} | ${s.hasText ? 'yes' : 'no'} | ${escapePipe(attrs)} |`);
  }
  out.push('');
  return out.join('\n');
}

// --- xsd -------------------------------------------------------------------

interface ElementShape {
  readonly name: string;
  /** Child element names in first-seen order. */
  readonly childOrder: string[];
  /** Max observed occurrences of each child within a single parent. */
  readonly childMax: Map<string, number>;
  /** Whether each child was ever absent across observed parents. */
  readonly childOptional: Set<string>;
  readonly attributes: Set<string>;
  hasText: boolean;
  /** Whether this element ever had child elements. */
  hasChildren: boolean;
}

/** Merge every occurrence of each element name into one shape summary. */
function collectShapes(root: XmlElement): Map<string, ElementShape> {
  const shapes = new Map<string, ElementShape>();

  const shapeOf = (name: string): ElementShape => {
    let s = shapes.get(name);
    if (s === undefined) {
      s = {
        name,
        childOrder: [],
        childMax: new Map(),
        childOptional: new Set(),
        attributes: new Set(),
        hasText: false,
        hasChildren: false,
      };
      shapes.set(name, s);
    }
    return s;
  };

  const visit = (el: XmlElement): void => {
    const shape = shapeOf(el.name);
    for (const a of Object.keys(el.attributes)) shape.attributes.add(a);

    const childCounts = new Map<string, number>();
    for (const child of el.children) {
      if (child.type === 'text') {
        if (child.value.trim() !== '') shape.hasText = true;
        continue;
      }
      shape.hasChildren = true;
      if (!shape.childOrder.includes(child.name)) shape.childOrder.push(child.name);
      childCounts.set(child.name, (childCounts.get(child.name) ?? 0) + 1);
      visit(child);
    }
    // Cardinality bookkeeping: max occurrences + optionality across parents.
    for (const name of shape.childOrder) {
      const n = childCounts.get(name) ?? 0;
      shape.childMax.set(name, Math.max(shape.childMax.get(name) ?? 0, n));
      if (n === 0) shape.childOptional.add(name);
    }
  };

  visit(root);
  return shapes;
}

function localName(name: string): string {
  const i = name.indexOf(':');
  return i === -1 ? name : name.slice(i + 1);
}

/**
 * `xml.export.xsd` — a W3C XML Schema (XSD) inferred from the document's
 * observed structure. Each distinct element name becomes a global
 * `<xs:element>`; elements with children get a `<xs:complexType><xs:sequence>`
 * (child `minOccurs`/`maxOccurs` from observed cardinality), elements with
 * attributes get `<xs:attribute>` declarations, text-only leaves are typed
 * `xs:string`. Inferred from samples — a generated starting point, not a
 * validating authority.
 */
export function toXsd(xml: ParsedXml): string {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  if (xml.root === null) {
    lines.push('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>');
    return lines.join('\n');
  }
  lines.push('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">');
  lines.push(`  <!-- Inferred by NekoXML from a sample document. A starting point, not authoritative. -->`);

  const shapes = collectShapes(xml.root);
  for (const shape of shapes.values()) {
    const name = localName(shape.name);
    const hasComplex = shape.hasChildren || shape.attributes.size > 0;
    if (!hasComplex) {
      lines.push(`  <xs:element name="${name}" type="xs:string"/>`);
      continue;
    }
    lines.push(`  <xs:element name="${name}">`);
    lines.push('    <xs:complexType>');
    if (shape.hasChildren) {
      lines.push('      <xs:sequence>');
      for (const child of shape.childOrder) {
        const max = shape.childMax.get(child) ?? 1;
        const minOccurs = shape.childOptional.has(child) ? 0 : 1;
        const maxOccurs = max > 1 ? 'unbounded' : '1';
        lines.push(
          `        <xs:element ref="${localName(child)}" minOccurs="${minOccurs}" maxOccurs="${maxOccurs}"/>`,
        );
      }
      lines.push('      </xs:sequence>');
    }
    for (const attr of [...shape.attributes].sort()) {
      lines.push(`      <xs:attribute name="${localName(attr)}" type="xs:string"/>`);
    }
    lines.push('    </xs:complexType>');
    lines.push('  </xs:element>');
  }

  lines.push('</xs:schema>');
  return lines.join('\n');
}
