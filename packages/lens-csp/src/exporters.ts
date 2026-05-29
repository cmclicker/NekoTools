import type { Exporter } from '@nekotools/contracts';

import {
  CSP_KIND_PARSED,
  CSP_PARSED_EXPORT_KINDS,
  type CspArtifact,
  type CspParsedArtifact,
  type CspReport,
} from './kinds.js';

const TOOL_ID = 'csp';

function pickParsed(artifacts: readonly CspArtifact[]): CspParsedArtifact | undefined {
  return artifacts.find((a): a is CspParsedArtifact => a.kind === CSP_KIND_PARSED);
}

/** `csp.export.json` — directives + findings. */
export const jsonExporter: Exporter<CspArtifact> = {
  version: 1,
  id: 'csp.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: CSP_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? { directives: [], directiveCount: 0, findings: [] };
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(value, null, 2) };
  },
};

/** `csp.export.normalized` — one directive per line (canonical re-serialization). */
export const normalizedExporter: Exporter<CspArtifact> = {
  version: 1,
  id: 'csp.export.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: CSP_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const directives = pickParsed(artifacts)?.value.directives ?? [];
    const body = directives.map((d) => [d.name, ...d.sources].join(' ')).join(';\n');
    return { mimeType: 'text/plain', extension: 'txt', body };
  },
};

/** `csp.export.markdown.summary` — directive table + findings. */
export const markdownSummaryExporter: Exporter<CspArtifact> = {
  version: 1,
  id: 'csp.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: CSP_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value: CspReport | undefined = pickParsed(artifacts)?.value;
    const lines: string[] = ['# NekoCSP export', ''];
    if (value !== undefined) {
      lines.push(`- directives: ${value.directiveCount}`, `- findings: ${value.findings.length}`, '');
      if (value.directives.length > 0) {
        lines.push('## Directives', '', '| directive | sources |', '| --- | --- |');
        for (const d of value.directives) lines.push(`| \`${d.name}\` | ${d.sources.join(' ') || '(empty)'} |`);
      }
      if (value.findings.length > 0) {
        lines.push('', '## Findings', '');
        for (const f of value.findings) lines.push(`- **${f.severity.toUpperCase()}**${f.directive ? ` [\`${f.directive}\`]` : ''} — ${f.message}`);
      }
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<CspArtifact>[] = [
  jsonExporter,
  normalizedExporter,
  markdownSummaryExporter,
];
