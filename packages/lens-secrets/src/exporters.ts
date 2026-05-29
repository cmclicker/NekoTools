import type { Exporter } from '@nekotools/contracts';

import {
  SECRET_KIND_REPORT,
  SECRET_REPORT_EXPORT_KINDS,
  type SecretArtifact,
  type SecretFinding,
  type SecretReport,
  type SecretReportArtifact,
} from './kinds.js';

const TOOL_ID = 'secrets';

function pickReport(artifacts: readonly SecretArtifact[]): SecretReportArtifact | undefined {
  return artifacts.find((a): a is SecretReportArtifact => a.kind === SECRET_KIND_REPORT);
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** `secret.export.json` — the findings as JSON (masked previews only). */
export const jsonExporter: Exporter<SecretArtifact> = {
  version: 1,
  id: 'secret.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: SECRET_REPORT_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const report = pickReport(artifacts)?.value ?? { findingCount: 0, findings: [] };
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(report, null, 2) };
  },
};

/** `secret.export.csv` — findings as a CSV table (masked previews only). */
export const csvExporter: Exporter<SecretArtifact> = {
  version: 1,
  id: 'secret.export.csv',
  toolId: TOOL_ID,
  target: 'csv',
  accepts: SECRET_REPORT_EXPORT_KINDS,
  producesMimeType: 'text/csv',
  producesExtension: 'csv',
  export({ artifacts }) {
    const findings = pickReport(artifacts)?.value.findings ?? [];
    const rows = ['ruleId,severity,line,column,length,preview,entropy'];
    for (const f of findings) {
      rows.push(
        [
          csvCell(f.ruleId),
          f.severity,
          String(f.line),
          String(f.column),
          String(f.length),
          csvCell(f.preview),
          f.entropy === null ? '' : String(f.entropy),
        ].join(','),
      );
    }
    return { mimeType: 'text/csv', extension: 'csv', body: rows.join('\n') };
  },
};

/** `secret.export.markdown.summary` — counts by severity + a findings table. */
export const markdownSummaryExporter: Exporter<SecretArtifact> = {
  version: 1,
  id: 'secret.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: SECRET_REPORT_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const report: SecretReport | undefined = pickReport(artifacts)?.value;
    const findings = report?.findings ?? [];
    const lines: string[] = ['# NekoSecrets export', ''];

    const counts = { high: 0, medium: 0, low: 0 };
    for (const f of findings) counts[f.severity] += 1;
    lines.push(
      `- findings: ${findings.length}`,
      `- high: ${counts.high} · medium: ${counts.medium} · low: ${counts.low}`,
    );

    if (findings.length > 0) {
      lines.push('', '| severity | rule | line:col | length | preview |');
      lines.push('| --- | --- | --- | ---: | --- |');
      for (const f of findings) lines.push(rowOf(f));
    } else {
      lines.push('', 'No secrets detected.');
    }

    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

function rowOf(f: SecretFinding): string {
  return `| ${f.severity} | \`${f.ruleId}\` | ${f.line}:${f.column} | ${f.length} | \`${f.preview}\` |`;
}

export const freeExporters: readonly Exporter<SecretArtifact>[] = [
  jsonExporter,
  csvExporter,
  markdownSummaryExporter,
];
