import type { Exporter } from '@nekotools/contracts';

import {
  REGEX_KIND_MATCHSET,
  REGEX_KIND_SUITE,
  REGEX_MATCHSET_EXPORT_KINDS,
  REGEX_SUITE_EXPORT_KINDS,
  type RegexArtifact,
  type RegexMatchSetArtifact,
  type RegexSuiteArtifact,
} from './kinds.js';
import { toExplain, toRedactionRecipe, toSnapshotReport, toSuiteReport } from './codegen.js';

const TOOL_ID = 'regex';

function pickMatchSet(artifacts: readonly RegexArtifact[]): RegexMatchSetArtifact | undefined {
  return artifacts.find((a): a is RegexMatchSetArtifact => a.kind === REGEX_KIND_MATCHSET);
}

function pickSuite(artifacts: readonly RegexArtifact[]): RegexSuiteArtifact | undefined {
  return artifacts.find((a): a is RegexSuiteArtifact => a.kind === REGEX_KIND_SUITE);
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

// --- Pro exporters (registered in the binary, gated by entitlement) --------
//
// These back ALL FOUR declared Pro exporter ids, each a pure function of its
// parsed artifact (native tokenization / matching, no remote/LLM, no eval;
// generators live in `codegen.ts`):
//
//   - `regex.export.explain`          / `regex.export.redaction.recipe`
//        consume a single-run `regex.matchset`.
//   - `regex.export.suite`            / `regex.export.snapshot`
//        consume a multi-case `regex.suite` (pasted via the suite parser's
//        `cases` hint — nothing is persisted; `canSaveWorkspace` is false).

/** `regex.export.explain` (Pro) — local structural pattern explanation. */
export const explainExporter: Exporter<RegexArtifact> = {
  version: 1,
  id: 'regex.export.explain',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: REGEX_MATCHSET_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const set = pickMatchSet(artifacts)?.value;
    const body = set === undefined ? '# NekoRegex pattern explanation\n\n(no pattern)' : toExplain(set);
    return { mimeType: 'text/markdown', extension: 'md', body };
  },
};

/** `regex.export.redaction.recipe` (Pro) — declarative JSON redaction recipe. */
export const redactionRecipeExporter: Exporter<RegexArtifact> = {
  version: 1,
  id: 'regex.export.redaction.recipe',
  toolId: TOOL_ID,
  target: 'json',
  accepts: REGEX_MATCHSET_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const set = pickMatchSet(artifacts)?.value;
    const recipe = set === undefined
      ? { tool: 'regex', match: { pattern: '', flags: 'g' }, replacement: '[REDACTED]', preserveGroups: [], apply: '', note: 'no pattern' }
      : toRedactionRecipe(set);
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(recipe, null, 2) };
  },
};

/** `regex.export.suite` (Pro) — markdown report of a multi-case test suite. */
export const suiteReportExporter: Exporter<RegexArtifact> = {
  version: 1,
  id: 'regex.export.suite',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: REGEX_SUITE_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const suite = pickSuite(artifacts)?.value;
    const body =
      suite === undefined ? '# NekoRegex test suite\n\n(no suite)' : toSuiteReport(suite);
    return { mimeType: 'text/markdown', extension: 'md', body };
  },
};

/** `regex.export.snapshot` (Pro) — deterministic regression baseline as JSON. */
export const snapshotExporter: Exporter<RegexArtifact> = {
  version: 1,
  id: 'regex.export.snapshot',
  toolId: TOOL_ID,
  target: 'json',
  accepts: REGEX_SUITE_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const suite = pickSuite(artifacts)?.value;
    const body =
      suite === undefined
        ? JSON.stringify({ tool: 'regex', kind: 'suite-snapshot', caseCount: 0, cases: [] }, null, 2)
        : toSnapshotReport(suite);
    return { mimeType: 'application/json', extension: 'json', body };
  },
};

export const proExporters: readonly Exporter<RegexArtifact>[] = [
  explainExporter,
  redactionRecipeExporter,
  suiteReportExporter,
  snapshotExporter,
];
