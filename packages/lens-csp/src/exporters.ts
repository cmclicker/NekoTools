import type { Exporter } from '@nekotools/contracts';

import { auditCsp, hardenCsp, serializeCsp } from './audit.js';
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

// --- Pro exporters (registered in the binary, gated by entitlement) --------

/**
 * `csp.export.report` (Pro) — a CSP posture audit report: every ruleId-keyed
 * finding (unsafe-inline/eval, wildcards, insecure schemes, data: URIs,
 * missing default-src / base-uri / form-action, absent reporting) with its
 * severity and directive. Pure + local.
 */
export const reportExporter: Exporter<CspArtifact> = {
  version: 1,
  id: 'csp.export.report',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: CSP_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const report = pickParsed(artifacts)?.value;
    const findings = auditCsp(report);
    const counts = { high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) counts[f.severity] += 1;

    const lines: string[] = ['# NekoCSP posture audit', ''];
    lines.push(
      `- directives: ${report?.directiveCount ?? 0}`,
      `- findings: ${findings.length} (high: ${counts.high}, medium: ${counts.medium}, low: ${counts.low}, info: ${counts.info})`,
      '',
    );
    if (findings.length > 0) {
      lines.push('| severity | rule | directive | detail |', '| --- | --- | --- | --- |');
      for (const f of findings) {
        lines.push(`| ${f.severity} | \`${f.ruleId}\` | ${f.directive ? `\`${f.directive}\`` : '—'} | ${f.detail} |`);
      }
    } else {
      lines.push('No posture issues detected.');
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

/**
 * `csp.export.hardened` (Pro) — the `suggest.hardened` capability: a stricter
 * Content-Security-Policy generated from the pasted one (drop unsafe-inline/
 * eval, collapse wildcards to 'self', upgrade http→https, add the safe
 * baseline directives) plus a changelog of what changed and why. The body is
 * the ready-to-paste header; the changelog rides in a leading comment block.
 * Pure + local — it suggests, it never fetches or evaluates.
 */
export const hardenedExporter: Exporter<CspArtifact> = {
  version: 1,
  id: 'csp.export.hardened',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: CSP_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const report = pickParsed(artifacts)?.value;
    const { directives, changes } = hardenCsp(report);
    const header = serializeCsp(directives);
    const lines: string[] = [];
    lines.push('# NekoCSP hardened policy');
    if (changes.length > 0) {
      for (const c of changes) lines.push(`#  - [${c.directive}] ${c.detail}`);
    } else {
      lines.push('#  (already hardened — no changes)');
    }
    lines.push('', header);
    return { mimeType: 'text/plain', extension: 'txt', body: lines.join('\n') };
  },
};

export const proExporters: readonly Exporter<CspArtifact>[] = [reportExporter, hardenedExporter];
