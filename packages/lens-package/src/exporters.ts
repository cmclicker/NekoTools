import type { Exporter } from '@nekotools/contracts';

import { auditPackage, type PackageAuditSeverity } from './audit.js';
import {
  PACKAGE_KIND_MANIFEST,
  PACKAGE_MANIFEST_EXPORT_KINDS,
  type PackageArtifact,
  type PackageManifestArtifact,
} from './kinds.js';

const TOOL_ID = 'package';

function pickManifest(
  artifacts: readonly PackageArtifact[],
): PackageManifestArtifact | undefined {
  return artifacts.find((artifact): artifact is PackageManifestArtifact => artifact.kind === PACKAGE_KIND_MANIFEST);
}

export const jsonSummaryExporter: Exporter<PackageArtifact> = {
  version: 1,
  id: 'package.export.summary.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: PACKAGE_MANIFEST_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts, diagnostics }) {
    const manifest = pickManifest(artifacts);
    const summary =
      manifest === undefined
        ? {}
        : {
            ...manifest.value,
            diagnostics: diagnostics.map((diagnostic) => ({
              severity: diagnostic.severity,
              code: diagnostic.code,
              message: diagnostic.message,
            })),
          };
    return {
      mimeType: 'application/json',
      extension: 'json',
      body: JSON.stringify(summary, null, 2),
    };
  },
};

export const markdownSummaryExporter: Exporter<PackageArtifact> = {
  version: 1,
  id: 'package.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: PACKAGE_MANIFEST_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const manifest = pickManifest(artifacts);
    const lines: string[] = ['# NekoPackage summary', ''];

    if (manifest === undefined) {
      lines.push('(no package manifest)', '');
    } else {
      const pkg = manifest.value;
      lines.push(
        `- **name** - ${pkg.name ?? '(missing)'}`,
        `- **version** - ${pkg.version ?? '(missing)'}`,
        `- **private** - ${pkg.private === null ? '(missing)' : String(pkg.private)}`,
        `- **package manager** - ${pkg.packageManager ?? '(missing)'}`,
        `- **dependencies** - ${pkg.dependencyCounts.total}`,
        `- **scripts** - ${pkg.scripts.length}`,
        '',
      );

      if (pkg.scripts.length > 0) {
        lines.push('## Scripts', '');
        for (const script of pkg.scripts) {
          const flags = script.riskFlags.length > 0 ? ` (${script.riskFlags.join(', ')})` : '';
          lines.push(`- \`${script.name}\`${flags}: \`${script.command}\``);
        }
        lines.push('');
      }

      if (pkg.dependencies.length > 0) {
        lines.push('## Dependencies', '');
        for (const dep of pkg.dependencies) {
          lines.push(`- \`${dep.name}\` ${dep.range} (${dep.section})`);
        }
        lines.push('');
      }
    }

    if (diagnostics.length > 0) {
      lines.push('## Diagnostics', '');
      for (const diagnostic of diagnostics) {
        lines.push(
          `- **${diagnostic.severity.toUpperCase()}** \`${diagnostic.code}\` - ${diagnostic.message}`,
        );
      }
      lines.push('');
    }

    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<PackageArtifact>[] = [
  jsonSummaryExporter,
  markdownSummaryExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------

const SARIF_LEVEL: Record<PackageAuditSeverity, string> = {
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'note',
};

/**
 * `package.export.policy.report` (Pro) — a dependency & license-risk policy
 * report: every ruleId-keyed finding (copyleft/missing/unknown license,
 * network-shell / lifecycle / destructive scripts, remote / unpinned /
 * duplicate dependencies) with its severity and target. Pure + local.
 */
export const policyReportExporter: Exporter<PackageArtifact> = {
  version: 1,
  id: 'package.export.policy.report',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: PACKAGE_MANIFEST_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const doc = pickManifest(artifacts)?.value;
    const findings = auditPackage(doc);
    const counts = { high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) counts[f.severity] += 1;

    const name = doc?.name ?? '(unnamed)';
    const lines: string[] = ['# NekoPackage risk audit', ''];
    lines.push(
      `- package: ${name}${doc?.version ? `@${doc.version}` : ''} (license: ${doc?.license ?? 'none'})`,
      `- findings: ${findings.length} (high: ${counts.high}, medium: ${counts.medium}, low: ${counts.low}, info: ${counts.info})`,
      '',
    );
    if (findings.length > 0) {
      lines.push('| severity | rule | target | detail |', '| --- | --- | --- | --- |');
      for (const f of findings) {
        lines.push(`| ${f.severity} | \`${f.ruleId}\` | ${f.target ? `\`${f.target}\`` : '—'} | ${f.detail} |`);
      }
    } else {
      lines.push('No dependency or license-risk findings detected.');
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

/**
 * `package.export.sarif` (Pro) — SARIF 2.1.0 of the risk audit so a
 * package.json review drops into CI code-scanning. Carries no secret
 * material; ruleIds match the diagnostic codes shown in the free tier.
 */
export const sarifExporter: Exporter<PackageArtifact> = {
  version: 1,
  id: 'package.export.sarif',
  toolId: TOOL_ID,
  target: 'json',
  accepts: PACKAGE_MANIFEST_EXPORT_KINDS,
  producesMimeType: 'application/sarif+json',
  producesExtension: 'sarif',
  export({ artifacts }) {
    const findings = auditPackage(pickManifest(artifacts)?.value);
    const ruleIds = [...new Set(findings.map((f) => f.ruleId))];
    const sarif = {
      version: '2.1.0',
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      runs: [
        {
          tool: {
            driver: {
              name: 'NekoPackage',
              informationUri: 'https://nekotools.local',
              rules: ruleIds.map((id) => ({ id })),
            },
          },
          results: findings.map((f) => ({
            ruleId: f.ruleId,
            level: SARIF_LEVEL[f.severity],
            message: { text: f.target ? `[${f.target}] ${f.detail}` : f.detail },
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

export const proExporters: readonly Exporter<PackageArtifact>[] = [
  policyReportExporter,
  sarifExporter,
];
