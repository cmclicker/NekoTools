import type { Exporter } from '@nekotools/contracts';

import { auditGitignore, type GitignoreAuditSeverity } from './audit.js';
import {
  GITIGNORE_KIND_PARSED,
  GITIGNORE_PARSED_EXPORT_KINDS,
  type GitignoreArtifact,
  type GitignoreParsedArtifact,
  type GitignoreReport,
} from './kinds.js';

const TOOL_ID = 'gitignore';

function pickParsed(artifacts: readonly GitignoreArtifact[]): GitignoreParsedArtifact | undefined {
  return artifacts.find((a): a is GitignoreParsedArtifact => a.kind === GITIGNORE_KIND_PARSED);
}

/** `gitignore.export.json` — rules + path-test results. */
export const jsonExporter: Exporter<GitignoreArtifact> = {
  version: 1,
  id: 'gitignore.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: GITIGNORE_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? { rules: [], patternCount: 0, commentCount: 0, paths: [] };
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(value, null, 2) };
  },
};

/** `gitignore.export.normalized` — patterns only (comments + blanks stripped), one per line. */
export const normalizedExporter: Exporter<GitignoreArtifact> = {
  version: 1,
  id: 'gitignore.export.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: GITIGNORE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const rules = pickParsed(artifacts)?.value.rules ?? [];
    const body = rules
      .filter((r) => r.pattern !== null)
      .map((r) => `${r.negated ? '!' : ''}${r.anchored && !r.pattern!.includes('/') ? '/' : ''}${r.pattern}${r.dirOnly ? '/' : ''}`)
      .join('\n');
    return { mimeType: 'text/plain', extension: 'txt', body };
  },
};

/** `gitignore.export.markdown.summary` — rule breakdown + path verdicts. */
export const markdownSummaryExporter: Exporter<GitignoreArtifact> = {
  version: 1,
  id: 'gitignore.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: GITIGNORE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value: GitignoreReport | undefined = pickParsed(artifacts)?.value;
    const lines: string[] = ['# NekoGitignore export', ''];
    if (value === undefined) {
      lines.push('No rules.');
      return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
    }
    lines.push(`- patterns: ${value.patternCount}`, `- comments: ${value.commentCount}`, '');
    lines.push('| line | pattern | negated | dir-only | anchored |', '| ---: | --- | --- | --- | --- |');
    for (const r of value.rules) {
      if (r.pattern === null) continue;
      lines.push(
        `| ${r.lineNo} | \`${r.pattern}\` | ${r.negated ? 'yes' : 'no'} | ${r.dirOnly ? 'yes' : 'no'} | ${r.anchored ? 'yes' : 'no'} |`,
      );
    }
    if (value.paths.length > 0) {
      lines.push('', '## Path tests', '', '| path | ignored | by line |', '| --- | --- | ---: |');
      for (const p of value.paths) {
        lines.push(`| \`${p.path}\` | ${p.ignored ? 'yes' : 'no'} | ${p.matchedBy ?? '—'} |`);
      }
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<GitignoreArtifact>[] = [
  jsonExporter,
  normalizedExporter,
  markdownSummaryExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------

const SARIF_LEVEL: Record<GitignoreAuditSeverity, string> = {
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'note',
};

/**
 * `gitignore.export.audit.report` (Pro) — a secret-leak coverage & hygiene
 * report: every ruleId-keyed finding (uncovered secret/credential paths,
 * uncovered junk artifacts, duplicate patterns) with its severity. Pure +
 * local.
 */
export const auditReportExporter: Exporter<GitignoreArtifact> = {
  version: 1,
  id: 'gitignore.export.audit.report',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: GITIGNORE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const report = pickParsed(artifacts)?.value;
    const findings = auditGitignore(report);
    const counts = { high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) counts[f.severity] += 1;

    const lines: string[] = ['# NekoGitignore secret-coverage audit', ''];
    lines.push(
      `- patterns: ${report?.patternCount ?? 0}`,
      `- findings: ${findings.length} (high: ${counts.high}, medium: ${counts.medium}, low: ${counts.low}, info: ${counts.info})`,
      '',
    );
    if (findings.length > 0) {
      lines.push('| severity | rule | target | detail |', '| --- | --- | --- | --- |');
      for (const f of findings) {
        lines.push(`| ${f.severity} | \`${f.ruleId}\` | ${f.target ? `\`${f.target}\`` : '—'} | ${f.detail} |`);
      }
    } else {
      lines.push('No coverage gaps or hygiene issues detected.');
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

/**
 * `gitignore.export.sarif` (Pro) — SARIF 2.1.0 of the coverage audit so a
 * .gitignore review drops into CI code-scanning (gate that secret paths are
 * ignored). Carries no secret material.
 */
export const sarifExporter: Exporter<GitignoreArtifact> = {
  version: 1,
  id: 'gitignore.export.sarif',
  toolId: TOOL_ID,
  target: 'json',
  accepts: GITIGNORE_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/sarif+json',
  producesExtension: 'sarif',
  export({ artifacts }) {
    const findings = auditGitignore(pickParsed(artifacts)?.value);
    const ruleIds = [...new Set(findings.map((f) => f.ruleId))];
    const sarif = {
      version: '2.1.0',
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      runs: [
        {
          tool: {
            driver: {
              name: 'NekoGitignore',
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

export const proExporters: readonly Exporter<GitignoreArtifact>[] = [
  auditReportExporter,
  sarifExporter,
];
