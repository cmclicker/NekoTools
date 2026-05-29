import type { Exporter } from '@nekotools/contracts';

import {
  REGEX_KIND_MATCHSET,
  REGEX_MATCHSET_EXPORT_KINDS,
  type RegexArtifact,
  type RegexMatchSetArtifact,
} from './kinds.js';

const TOOL_ID = 'regex';

function pickMatchSet(artifacts: readonly RegexArtifact[]): RegexMatchSetArtifact | undefined {
  return artifacts.find((a): a is RegexMatchSetArtifact => a.kind === REGEX_KIND_MATCHSET);
}

/** Full match analysis as pretty-printed JSON. */
export const jsonExporter: Exporter<RegexArtifact> = {
  version: 1,
  id: 'regex.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: REGEX_MATCHSET_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const set = pickMatchSet(artifacts)?.value;
    const body = JSON.stringify(set ?? null, null, 2);
    return { mimeType: 'application/json', extension: 'json', body };
  },
};

/** Human-readable markdown summary of the run + diagnostics. */
export const markdownSummaryExporter: Exporter<RegexArtifact> = {
  version: 1,
  id: 'regex.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: REGEX_MATCHSET_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const set = pickMatchSet(artifacts)?.value;
    const lines: string[] = ['# NekoRegex export', ''];
    if (set) {
      lines.push(`- **pattern**: \`${set.pattern}\``);
      lines.push(`- **flags**: \`${set.flags.applied || '(none)'}\``);
      lines.push(`- **valid**: ${set.valid ? 'yes' : 'no'}`);
      if (set.error !== null) lines.push(`- **error**: ${set.error}`);
      lines.push(`- **matches**: ${set.matchCount}`);
      lines.push(`- **capture groups**: ${set.groupCount}`);
      if (set.namedGroupNames.length > 0) {
        lines.push(`- **named groups**: ${set.namedGroupNames.join(', ')}`);
      }
      lines.push('');
      if (set.matches.length > 0) {
        lines.push('## Matches', '');
        for (const m of set.matches) {
          lines.push(`- \`${m.value}\` at [${m.start}, ${m.end})`);
          for (const g of m.groups) {
            lines.push(`  - group ${g.index}: ${g.value === null ? '(no match)' : `\`${g.value}\``}`);
          }
          for (const [name, value] of Object.entries(m.namedGroups)) {
            lines.push(`  - <${name}>: ${value === null ? '(no match)' : `\`${value}\``}`);
          }
        }
        lines.push('');
      }
    }
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

/** The pattern + flags as a copy-paste-ready JS literal plus raw fields. */
export const patternExporter: Exporter<RegexArtifact> = {
  version: 1,
  id: 'regex.export.pattern',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: REGEX_MATCHSET_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const set = pickMatchSet(artifacts)?.value;
    if (!set) return { mimeType: 'text/plain', extension: 'txt', body: '' };
    const body = [
      `/${set.pattern}/${set.flags.applied}`,
      `pattern: ${set.pattern}`,
      `flags: ${set.flags.applied || '(none)'}`,
    ].join('\n');
    return { mimeType: 'text/plain', extension: 'txt', body };
  },
};

export const freeExporters: readonly Exporter<RegexArtifact>[] = [
  jsonExporter,
  markdownSummaryExporter,
  patternExporter,
];
