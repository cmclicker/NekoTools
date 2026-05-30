import type { Exporter } from '@nekotools/contracts';

import {
  HEADERS_DOCUMENT_EXPORT_KINDS,
  HEADERS_KIND_DOCUMENT,
  type HeadersArtifact,
  type HeadersDocumentArtifact,
} from './kinds.js';
import { auditHeaders, type HeaderAuditSeverity } from './audit.js';

const TOOL_ID = 'headers';

function pickDocuments(artifacts: readonly HeadersArtifact[]): readonly HeadersDocumentArtifact[] {
  return artifacts.filter((a): a is HeadersDocumentArtifact => a.kind === HEADERS_KIND_DOCUMENT);
}

/**
 * Headers as a JSON object (name -> value). Repeated names collapse to an
 * array of values so the export is lossless. Names keep their original
 * case from the first occurrence.
 */
export const jsonExporter: Exporter<HeadersArtifact> = {
  version: 1,
  id: 'headers.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: HEADERS_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const out: Record<string, string | string[]> = {};
    for (const doc of pickDocuments(artifacts)) {
      for (const entry of doc.value.entries) {
        const existing = out[entry.name];
        if (existing === undefined) {
          out[entry.name] = entry.value;
        } else if (Array.isArray(existing)) {
          existing.push(entry.value);
        } else {
          out[entry.name] = [existing, entry.value];
        }
      }
    }
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(out, null, 2) };
  },
};

/** Markdown summary: header count, the headers, and any diagnostics. */
export const markdownSummaryExporter: Exporter<HeadersArtifact> = {
  version: 1,
  id: 'headers.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: HEADERS_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const docs = pickDocuments(artifacts);
    const lines: string[] = ['# NekoHeaders export', ''];
    for (const doc of docs) {
      if (doc.value.startLine !== null) lines.push(`- start line: \`${doc.value.startLine}\``);
      lines.push(`- ${doc.value.entries.length} header${doc.value.entries.length === 1 ? '' : 's'}`);
      for (const entry of doc.value.entries) {
        lines.push(`  - \`${entry.name}\`: ${entry.value}`);
      }
    }
    lines.push('');
    if (diagnostics.length > 0) {
      lines.push('## Diagnostics', '');
      for (const d of diagnostics) {
        lines.push(`- **${d.severity.toUpperCase()}** \`${d.code}\` — ${d.message}`);
      }
      lines.push('');
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<HeadersArtifact>[] = [
  jsonExporter,
  markdownSummaryExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------

const SARIF_LEVEL: Record<HeaderAuditSeverity, string> = {
  high: 'error',
  medium: 'warning',
  low: 'note',
};

/**
 * `headers.export.audit.report` (Pro) — a markdown security-posture audit:
 * missing hardening headers, weak values, permissive CORS, info-leak headers,
 * with stable rule ids + a verdict.
 */
export const auditReportExporter: Exporter<HeadersArtifact> = {
  version: 1,
  id: 'headers.export.audit.report',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: HEADERS_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const doc = pickDocuments(artifacts)[0]?.value;
    const findings = auditHeaders(doc);
    const counts = { high: 0, medium: 0, low: 0 };
    for (const f of findings) counts[f.severity] += 1;
    const lines: string[] = ['# NekoHeaders security audit', ''];
    lines.push(
      `- verdict: **${findings.length === 0 ? 'PASS' : 'ISSUES FOUND'}**`,
      `- findings: ${findings.length} (high: ${counts.high}, medium: ${counts.medium}, low: ${counts.low})`,
      '',
    );
    if (findings.length > 0) {
      lines.push('| severity | rule | detail |', '| --- | --- | --- |');
      for (const f of findings) lines.push(`| ${f.severity} | \`${f.ruleId}\` | ${f.detail} |`);
    } else {
      lines.push('No security-header issues detected.');
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

/**
 * `headers.export.sarif` (Pro) — SARIF 2.1.0 of the audit findings so a header
 * review drops straight into CI code-scanning.
 */
export const sarifExporter: Exporter<HeadersArtifact> = {
  version: 1,
  id: 'headers.export.sarif',
  toolId: TOOL_ID,
  target: 'json',
  accepts: HEADERS_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'application/sarif+json',
  producesExtension: 'sarif',
  export({ artifacts }) {
    const doc = pickDocuments(artifacts)[0]?.value;
    const findings = auditHeaders(doc);
    const ruleIds = [...new Set(findings.map((f) => f.ruleId))];
    const sarif = {
      version: '2.1.0',
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      runs: [
        {
          tool: {
            driver: {
              name: 'NekoHeaders',
              informationUri: 'https://nekotools.local',
              rules: ruleIds.map((id) => ({ id })),
            },
          },
          results: findings.map((f) => ({
            ruleId: f.ruleId,
            level: SARIF_LEVEL[f.severity],
            message: { text: f.detail },
          })),
        },
      ],
    };
    return {
      mimeType: 'application/sarif+json',
      extension: 'sarif',
      body: JSON.stringify(sarif, null, 2),
    };
  },
};

export const proExporters: readonly Exporter<HeadersArtifact>[] = [
  auditReportExporter,
  sarifExporter,
];
