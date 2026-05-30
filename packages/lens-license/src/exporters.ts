import type { Exporter } from '@nekotools/contracts';

import { auditLicense, type LicenseAuditSeverity } from './audit.js';
import {
  LICENSE_KIND_PARSED,
  LICENSE_PARSED_EXPORT_KINDS,
  type LicenseArtifact,
  type LicenseParsedArtifact,
  type LicenseReport,
} from './kinds.js';

const TOOL_ID = 'license';

function pickParsed(artifacts: readonly LicenseArtifact[]): LicenseParsedArtifact | undefined {
  return artifacts.find((a): a is LicenseParsedArtifact => a.kind === LICENSE_KIND_PARSED);
}

/** `license.export.json` — the detection result + metadata. */
export const jsonExporter: Exporter<LicenseArtifact> = {
  version: 1,
  id: 'license.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: LICENSE_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? null;
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(value, null, 2) };
  },
};

/** `license.export.normalized` — the detected SPDX id (or "UNKNOWN"). */
export const normalizedExporter: Exporter<LicenseArtifact> = {
  version: 1,
  id: 'license.export.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: LICENSE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const primary = pickParsed(artifacts)?.value.primary ?? null;
    return { mimeType: 'text/plain', extension: 'txt', body: primary ?? 'UNKNOWN' };
  },
};

/** `license.export.markdown.summary` — id + category + permissions/conditions/limitations. */
export const markdownSummaryExporter: Exporter<LicenseArtifact> = {
  version: 1,
  id: 'license.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: LICENSE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value: LicenseReport | undefined = pickParsed(artifacts)?.value;
    const lines: string[] = ['# NekoLicense export', ''];
    if (value === undefined || value.primary === null) {
      lines.push('- detected: (unknown)');
      if (value?.spdxTag) lines.push(`- SPDX tag: \`${value.spdxTag}\``);
      return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
    }
    lines.push(`- detected: \`${value.primary}\``);
    if (value.spdxTag) lines.push(`- SPDX tag: \`${value.spdxTag}\``);
    if (value.meta) {
      lines.push(
        `- name: ${value.meta.name}`,
        `- category: ${value.meta.category}`,
        '',
        `- **permissions:** ${value.meta.permissions.join(', ') || '—'}`,
        `- **conditions:** ${value.meta.conditions.join(', ') || '—'}`,
        `- **limitations:** ${value.meta.limitations.join(', ') || '—'}`,
      );
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<LicenseArtifact>[] = [
  jsonExporter,
  normalizedExporter,
  markdownSummaryExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------

const SARIF_LEVEL: Record<LicenseAuditSeverity, string> = {
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'note',
};

/**
 * `license.export.audit.report` (Pro) — an obligations & risk report for the
 * detected license: copyleft / network-copyleft risk, source-disclosure and
 * same-license obligations, and detection-quality signals, each ruleId-keyed
 * with a severity. Pure + local; informational, not legal advice.
 */
export const auditReportExporter: Exporter<LicenseArtifact> = {
  version: 1,
  id: 'license.export.audit.report',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: LICENSE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value;
    const findings = auditLicense(value);
    const counts = { high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) counts[f.severity] += 1;

    const lines: string[] = ['# NekoLicense obligations & risk audit', ''];
    lines.push(
      `- license: ${value?.primary ?? '(unknown)'}${value?.spdxTag ? ` (SPDX tag: ${value.spdxTag})` : ''}`,
      `- findings: ${findings.length} (high: ${counts.high}, medium: ${counts.medium}, low: ${counts.low}, info: ${counts.info})`,
      '',
    );
    if (findings.length > 0) {
      lines.push('| severity | rule | detail |', '| --- | --- | --- |');
      for (const f of findings) lines.push(`| ${f.severity} | \`${f.ruleId}\` | ${f.detail} |`);
    } else {
      lines.push('No copyleft obligations or detection issues — low-risk for typical commercial use.');
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

/**
 * `license.export.sarif` (Pro) — SARIF 2.1.0 of the obligations & risk audit
 * so a LICENSE review drops into CI code-scanning (gate copyleft / AGPL in a
 * commercial codebase). Carries no secret material.
 */
export const sarifExporter: Exporter<LicenseArtifact> = {
  version: 1,
  id: 'license.export.sarif',
  toolId: TOOL_ID,
  target: 'json',
  accepts: LICENSE_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/sarif+json',
  producesExtension: 'sarif',
  export({ artifacts }) {
    const findings = auditLicense(pickParsed(artifacts)?.value);
    const ruleIds = [...new Set(findings.map((f) => f.ruleId))];
    const sarif = {
      version: '2.1.0',
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      runs: [
        {
          tool: {
            driver: {
              name: 'NekoLicense',
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

export const proExporters: readonly Exporter<LicenseArtifact>[] = [
  auditReportExporter,
  sarifExporter,
];
