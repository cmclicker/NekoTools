import type { Exporter } from '@nekotools/contracts';

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
