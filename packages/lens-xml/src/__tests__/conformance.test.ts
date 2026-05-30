import { describe, expect, it } from 'vitest';
import type { Artifact, Entitlement, Workspace } from '@nekotools/contracts';
import {
  EntitlementError,
  ToolRegistry,
  jsonWorkspaceSerializer,
  runExporter,
  runParser,
  validateManifest,
} from '@nekotools/tool-runtime';
import { validate } from '@nekotools/schemas';

import { FIXED_CLOCK, XML_KIND_PARSED, buildXmlRegistration, xmlManifest } from '../index.js';
import type { XmlParsedArtifact } from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-28T00:00:00.000Z');

const PRO: Entitlement = {
  version: 1,
  licenseId: 'TEST',
  licensee: 'Test User',
  tier: 'pro',
  features: ['*'],
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  signature: 'test',
};

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildXmlRegistration(clock));
  return r;
}

function parseText(raw: string) {
  return runParser(registry(), 'xml', 'xml.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function parsedOf(raw: string): XmlParsedArtifact {
  return parseText(raw).artifacts.find((a) => a.kind === XML_KIND_PARSED) as XmlParsedArtifact;
}

describe('NekoXML: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(xmlManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy', () => {
    expect(xmlManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('declares an out-of-scope list covering DTD/XXE + network', () => {
    expect(xmlManifest.outOfScope.some((s) => /DTD|external entit|XXE/i.test(s))).toBe(true);
    expect(xmlManifest.outOfScope.some((s) => /network|fetch/i.test(s))).toBe(true);
  });

  it('capabilities reflect current-build truth (no diff, no graph)', () => {
    expect(xmlManifest.capabilities.canDiff).toBe(false);
    expect(xmlManifest.capabilities.canProjectGraph).toBe(false);
    expect(xmlManifest.capabilities.canExport).toBe(true);
  });
});

describe('NekoXML: monetization gating (single-build, entitlement-gated)', () => {
  const registration = buildXmlRegistration(clock);
  const proExporterIds = ['xml.export.xpath.report', 'xml.export.xsd'];

  it('Pro exporters are declared AND registered as proExporters, not free', () => {
    const free = new Set(registration.exporters.map((e) => e.id));
    const pro = new Set((registration.proExporters ?? []).map((e) => e.id));
    for (const id of proExporterIds) {
      expect(xmlManifest.exporters).toContain(id);
      expect(pro.has(id)).toBe(true);
      expect(free.has(id)).toBe(false);
    }
  });

  it('a free caller (default entitlement) is refused with EntitlementError', () => {
    const r = registry();
    const parsed = parseText('<catalog><item id="1"><name>A</name></item><item id="2"><name>B</name></item></catalog>');
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'xml', id, parsed)).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the path-inventory + XSD exporters', () => {
    const r = registry();
    const parsed = parseText('<catalog><item id="1"><name>A</name></item><item id="2"><name>B</name></item></catalog>');

    const report = String(runExporter(r, 'xml', 'xml.export.xpath.report', parsed, PRO).body);
    expect(report).toContain('# NekoXML path inventory');
    expect(report).toContain('`/catalog/item`');
    expect(report).toContain('`/catalog/item/name`');

    const xsd = String(runExporter(r, 'xml', 'xml.export.xsd', parsed, PRO).body);
    expect(xsd).toContain('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">');
    expect(xsd).toContain('<xs:element name="catalog">');
    expect(xsd).toContain('maxOccurs="unbounded"'); // item repeats under catalog
    expect(xsd).toContain('<xs:attribute name="id" type="xs:string"/>');
  });

  it('a truly unknown exporter id still throws "unknown exporter"', () => {
    expect(() =>
      runExporter(registry(), 'xml', 'xml.export.nope', { artifacts: [], diagnostics: [] }, PRO),
    ).toThrow(/unknown exporter/);
  });

  it('free entitlements match exactly the implemented vertical-slice set', () => {
    const expectedFree = new Set([
      'parse',
      'inspect.tree',
      'diagnostics.wellformed',
      'convert.json',
      'prettyprint',
      'export.json',
      'export.pretty',
      'export.markdown.summary',
      'copy.output',
      'workspace.save',
    ]);
    expect(new Set(xmlManifest.entitlements.free)).toEqual(expectedFree);
  });
});

describe('NekoXML: xml.text parser', () => {
  it('decodes elements, attributes, and nested children', () => {
    const root = parsedOf('<root a="1"><child>hi</child></root>').value.root!;
    expect(root.name).toBe('root');
    expect(root.attributes).toEqual({ a: '1' });
    expect(root.children).toHaveLength(1);
    const child = root.children[0];
    expect(child).toMatchObject({ type: 'element', name: 'child' });
  });

  it('decodes self-closing elements and a declaration', () => {
    const value = parsedOf('<?xml version="1.0" encoding="UTF-8"?><r><br/></r>').value;
    expect(value.declaration).toEqual({ version: '1.0', encoding: 'UTF-8', standalone: null });
    expect(value.root!.children[0]).toMatchObject({ name: 'br', children: [] });
  });

  it('decodes built-in and numeric entities in text and attributes', () => {
    const root = parsedOf('<a t="x &amp; y">1 &lt; 2 &#65;</a>').value.root!;
    expect(root.attributes.t).toBe('x & y');
    expect(root.children[0]).toEqual({ type: 'text', value: '1 < 2 A' });
  });

  it('decodes CDATA verbatim (no entity expansion inside)', () => {
    const root = parsedOf('<a><![CDATA[<not> & parsed]]></a>').value.root!;
    expect(root.children[0]).toEqual({ type: 'text', value: '<not> & parsed' });
  });

  it('ignores comments', () => {
    const root = parsedOf('<a><!-- skip me --><b/></a>').value.root!;
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toMatchObject({ name: 'b' });
  });

  it('emits xml.empty_input (info) for empty input and still produces an artifact', () => {
    const result = parseText('   ');
    expect(result.artifacts.find((a) => a.kind === XML_KIND_PARSED)).toBeDefined();
    expect(result.diagnostics.find((d) => d.code === 'xml.empty_input')?.severity).toBe('info');
    expect((result.artifacts[0] as XmlParsedArtifact).value.valid).toBe(false);
  });

  it('emits xml.mismatched_tag (error) without throwing', () => {
    const call = () => parseText('<a></b>');
    expect(call).not.toThrow();
    const diag = call().diagnostics.find((d) => d.code === 'xml.mismatched_tag');
    expect(diag?.severity).toBe('error');
    expect(diag?.message).toContain('line 1');
  });

  it('emits xml.unclosed_tag (error) when EOF is reached with open tags', () => {
    const diag = parseText('<a><b></b>').diagnostics.find((d) => d.code === 'xml.unclosed_tag');
    expect(diag?.severity).toBe('error');
  });

  it('emits xml.multiple_roots (warning) for more than one top-level element', () => {
    const result = parseText('<a/><b/>');
    expect(result.diagnostics.find((d) => d.code === 'xml.multiple_roots')?.severity).toBe('warning');
    // The first element is the retained root.
    expect((result.artifacts[0] as XmlParsedArtifact).value.root!.name).toBe('a');
  });

  it('emits xml.duplicate_attribute (warning) and keeps the first value', () => {
    const result = parseText('<a x="1" x="2"/>');
    expect(result.diagnostics.find((d) => d.code === 'xml.duplicate_attribute')?.severity).toBe(
      'warning',
    );
    expect((result.artifacts[0] as XmlParsedArtifact).value.root!.attributes).toEqual({ x: '1' });
  });

  it('skips a DOCTYPE and flags xml.external_entity (XXE-safe) without resolving it', () => {
    const xxe = '<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]><a>&xxe;</a>';
    const result = parseText(xxe);
    expect(result.diagnostics.find((d) => d.code === 'xml.external_entity')?.severity).toBe(
      'warning',
    );
    // The external entity is NOT expanded — its literal reference is left untouched.
    const root = (result.artifacts[0] as XmlParsedArtifact).value.root!;
    expect(root.children[0]).toEqual({ type: 'text', value: '&xxe;' });
    expect(JSON.stringify(result.artifacts[0])).not.toContain('etc/passwd');
  });

  it('produces an xml.parsed artifact that validates against the artifact schema', () => {
    const validation = validate('artifact', parsedOf('<a b="1"><c/></a>'));
    expect(validation.ok, validation.errors.join('; ')).toBe(true);
  });
});

describe('NekoXML: exporters', () => {
  it('xml.export.json converts the tree (attrs as @, repeated tags as arrays)', () => {
    const out = runExporter(registry(), 'xml', 'xml.export.json', {
      artifacts: [parsedOf('<list n="2"><item>a</item><item>b</item></list>')],
      diagnostics: [],
    });
    expect(JSON.parse(String(out.body))).toEqual({
      list: { '@n': '2', item: ['a', 'b'] },
    });
  });

  it('xml.export.pretty re-serializes with indentation (round-trips structurally)', () => {
    const out = runExporter(registry(), 'xml', 'xml.export.pretty', {
      artifacts: [parsedOf('<r><a x="1">hi</a><b/></r>')],
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toContain('<r>');
    expect(body).toContain('<a x="1">hi</a>');
    expect(body).toContain('<b/>');
    // Re-parsing the pretty output yields the same root + element count.
    const reparsed = parsedOf(body).value;
    expect(reparsed.root!.name).toBe('r');
    expect(reparsed.elementCount).toBe(3);
  });

  it('xml.export.markdown.summary describes shape + diagnostics', () => {
    const parsed = parseText('<a></b>');
    const out = runExporter(registry(), 'xml', 'xml.export.markdown.summary', {
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
    });
    const body = String(out.body);
    expect(body).toContain('# NekoXML export');
    expect(body).toContain('xml.mismatched_tag');
  });

  it('the exporter refuses a foreign artifact kind (runtime enforces accepts)', () => {
    const foreign = { ...parsedOf('<a/>'), kind: 'json.value' } as unknown as Artifact;
    for (const id of ['xml.export.json', 'xml.export.pretty', 'xml.export.markdown.summary']) {
      expect(() =>
        runExporter(registry(), 'xml', id, { artifacts: [foreign], diagnostics: [] }),
      ).toThrow(/does not accept artifact kind/);
    }
  });
});

describe('NekoXML: workspace round-trip', () => {
  it('a parsed-XML workspace round-trips losslessly', () => {
    const parsed = parseText('<config env="prod"><db host="localhost"/></config>');
    const ws: Workspace = {
      version: 1,
      id: 'ws_xml_single',
      toolId: 'xml',
      toolVersion: 1,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { viewMode: 'json' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
