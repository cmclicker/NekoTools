import type { ToolManifest } from '@nekotools/contracts';
import { DEFAULT_OFFLINE_POLICY } from '@nekotools/contracts';

import { XML_KIND_PARSED } from './kinds.js';

/**
 * The NekoXML manifest.
 *
 * Reading model (same as the other lenses):
 *   - `entitlements.free` lists features this build ships with a working
 *     implementation. NekoXML ships as a vertical slice (engine + UI in
 *     one PR), so the free list includes both the engine surfaces and the
 *     UI affordances actually wired up here.
 *   - `entitlements.pro` is advertising for a future `@nekotools-pro/*`
 *     package; nothing Pro is bundled or registered. The two Pro exporter
 *     ids below are declared but intentionally NOT registered in the free
 *     build; the monetization-safety tests assert they throw
 *     "unknown exporter".
 *
 * Offline policy is the default `network-forbidden`. Crucially, NekoXML
 * never resolves a DTD or expands an external entity — `<!DOCTYPE>` is
 * skipped and flagged — so the XXE / billion-laughs attack class is
 * impossible by construction, not just by policy.
 */
export const xmlManifest: ToolManifest = {
  version: 1,
  id: 'xml',
  name: 'NekoXML',
  toolVersion: 1,
  summary:
    'Parse, inspect, and convert XML locally — element tree, XML→JSON, pretty-print, well-formedness diagnostics. No DTD resolution, no external entities, no network, ever.',
  artifactKinds: [XML_KIND_PARSED],
  parsers: ['xml.text'],
  exporters: [
    'xml.export.json',
    'xml.export.pretty',
    'xml.export.markdown.summary',
    // Pro — declared as advertising, NOT registered in the free build.
    'xml.export.xpath.report',
    'xml.export.xsd',
  ],
  offlinePolicy: DEFAULT_OFFLINE_POLICY,
  capabilities: {
    canSaveWorkspace: true,
    canExport: true,
    canDiff: false,
    canProjectGraph: false,
  },
  entitlements: {
    free: [
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
    ],
    pro: [
      'query.xpath',
      'validate.xsd',
      'validate.dtd',
      'infer.schema',
      'semantic.diff',
      'namespace.resolve',
      'export.xpath.report',
      'export.xsd',
      'workspace.snapshots',
    ],
  },
  outOfScope: [
    'resolving DTDs, expanding external entities, or any XXE-style include',
    'fetching namespace URIs or schema locations referenced in the document',
    'XPath / XQuery evaluation and XSD/DTD validation (Pro)',
    'namespace prefix resolution (prefixes are preserved verbatim)',
    'network access of any kind during inspection',
  ],
};
