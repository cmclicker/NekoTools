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

// --- Pro exporters (registered in the binary, gated by entitlement) --------

const SARIF_LEVEL: Record<string, string> = { high: 'error', medium: 'warning', low: 'note' };

/**
 * `secret.export.sarif` (Pro) — SARIF 2.1.0 so findings drop straight into
 * CI code-scanning dashboards. Carries masked previews only.
 */
export const sarifExporter: Exporter<SecretArtifact> = {
  version: 1,
  id: 'secret.export.sarif',
  toolId: TOOL_ID,
  target: 'json',
  accepts: SECRET_REPORT_EXPORT_KINDS,
  producesMimeType: 'application/sarif+json',
  producesExtension: 'sarif',
  export({ artifacts }) {
    const findings = pickReport(artifacts)?.value.findings ?? [];
    const ruleIds = [...new Set(findings.map((f) => f.ruleId))];
    const sarif = {
      version: '2.1.0',
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      runs: [
        {
          tool: { driver: { name: 'NekoSecrets', informationUri: 'https://nekotools.local', rules: ruleIds.map((id) => ({ id })) } },
          results: findings.map((f) => ({
            ruleId: f.ruleId,
            level: SARIF_LEVEL[f.severity] ?? 'warning',
            message: { text: `${f.description} (${f.preview})` },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'input' },
                  region: { startLine: f.line, startColumn: f.column },
                },
              },
            ],
          })),
        },
      ],
    };
    return { mimeType: 'application/sarif+json', extension: 'sarif', body: JSON.stringify(sarif, null, 2) };
  },
};

/**
 * `secret.export.redacted` (Pro) — the original text with every detected
 * secret replaced by `[REDACTED:<ruleId>]`. Safe to paste into a ticket.
 */
export const redactedExporter: Exporter<SecretArtifact> = {
  version: 1,
  id: 'secret.export.redacted',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: SECRET_REPORT_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const body = pickReport(artifacts)?.value.redactedText ?? '';
    return { mimeType: 'text/plain', extension: 'txt', body };
  },
};

export const proExporters: readonly Exporter<SecretArtifact>[] = [sarifExporter, redactedExporter];
