import type { Exporter } from '@nekotools/contracts';

import {
  PASSWORD_KIND_REPORT,
  PASSWORD_REPORT_EXPORT_KINDS,
  type PasswordArtifact,
  type PasswordReport,
  type PasswordReportArtifact,
} from './kinds.js';

const TOOL_ID = 'password';

function pickReport(artifacts: readonly PasswordArtifact[]): PasswordReportArtifact | undefined {
  return artifacts.find((a): a is PasswordReportArtifact => a.kind === PASSWORD_KIND_REPORT);
}

/** `password.export.json` — the metrics report (never the password). */
export const jsonExporter: Exporter<PasswordArtifact> = {
  version: 1,
  id: 'password.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: PASSWORD_REPORT_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const value = pickReport(artifacts)?.value ?? null;
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(value, null, 2) };
  },
};

/** `password.export.crack-times` — the crack-time scenarios, one per line. */
export const crackTimesExporter: Exporter<PasswordArtifact> = {
  version: 1,
  id: 'password.export.crack-times',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: PASSWORD_REPORT_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const times = pickReport(artifacts)?.value.crackTimes ?? [];
    const body = times.map((t) => `${t.scenario}: ${t.display}`).join('\n');
    return { mimeType: 'text/plain', extension: 'txt', body };
  },
};

/** `password.export.markdown.summary` — score, entropy, crack times, warnings. */
export const markdownSummaryExporter: Exporter<PasswordArtifact> = {
  version: 1,
  id: 'password.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: PASSWORD_REPORT_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value: PasswordReport | undefined = pickReport(artifacts)?.value;
    const lines: string[] = ['# NekoPassword export', ''];
    if (value === undefined) {
      lines.push('No assessment.');
      return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
    }
    lines.push(
      `- score: ${value.score}/4 (${value.label})`,
      `- length: ${value.length}`,
      `- entropy: ~${value.entropyBits} bits (brute-force ${value.bruteforceBits}, Shannon ${value.shannonBits})`,
      `- character pool: ${value.poolSize}`,
      '',
      '## Estimated crack time',
      '',
    );
    for (const t of value.crackTimes) lines.push(`- ${t.scenario}: **${t.display}**`);
    if (value.warnings.length > 0) {
      lines.push('', '## Warnings', '');
      for (const w of value.warnings) lines.push(`- ${w}`);
    }
    if (value.suggestions.length > 0) {
      lines.push('', '## Suggestions', '');
      for (const s of value.suggestions) lines.push(`- ${s}`);
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<PasswordArtifact>[] = [
  jsonExporter,
  crackTimesExporter,
  markdownSummaryExporter,
];
