import type { Exporter } from '@nekotools/contracts';

import { compileRule } from './gitignore.js';
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

/** Canonical re-serialization of a single pattern rule (matches `normalized`). */
function canonicalPattern(rule: { negated: boolean; anchored: boolean; dirOnly: boolean; pattern: string }): string {
  const anchorSlash = rule.anchored && !rule.pattern.includes('/') ? '/' : '';
  return `${rule.negated ? '!' : ''}${anchorSlash}${rule.pattern}${rule.dirOnly ? '/' : ''}`;
}

/**
 * `gitignore.export.regex` (Pro) — the `explain.match` capability: each
 * pattern rule paired with the exact RegExp it compiles to (the engine's real
 * matcher), so a reviewer can see precisely what a rule matches. JSON array of
 * `{ lineNo, pattern, negated, dirOnly, anchored, regex }`. Pure + local.
 */
export const regexExporter: Exporter<GitignoreArtifact> = {
  version: 1,
  id: 'gitignore.export.regex',
  toolId: TOOL_ID,
  target: 'json',
  accepts: GITIGNORE_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const rules = pickParsed(artifacts)?.value.rules ?? [];
    const out = rules
      .map((rule) => {
        const compiled = compileRule(rule);
        if (compiled === null || rule.pattern === null) return null;
        return {
          lineNo: rule.lineNo,
          pattern: rule.pattern,
          negated: rule.negated,
          dirOnly: rule.dirOnly,
          anchored: rule.anchored,
          regex: compiled.regex.source,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(out, null, 2) };
  },
};

/**
 * `gitignore.export.merged` (Pro) — the `merge.files` / `redundancy.analyze`
 * capability: a single canonical .gitignore with exact-duplicate patterns
 * collapsed (first occurrence wins; order preserved because negation order is
 * significant) and comments/blanks stripped. A leading comment notes how many
 * duplicates were removed. Pure + local.
 */
export const mergedExporter: Exporter<GitignoreArtifact> = {
  version: 1,
  id: 'gitignore.export.merged',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: GITIGNORE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const rules = pickParsed(artifacts)?.value.rules ?? [];
    const seen = new Set<string>();
    const merged: string[] = [];
    let removed = 0;
    for (const rule of rules) {
      if (rule.pattern === null) continue;
      const canonical = canonicalPattern({ ...rule, pattern: rule.pattern });
      if (seen.has(canonical)) {
        removed += 1;
        continue;
      }
      seen.add(canonical);
      merged.push(canonical);
    }
    const header = `# NekoGitignore merged — ${merged.length} unique pattern(s)${
      removed > 0 ? `, ${removed} duplicate(s) removed` : ''
    }`;
    return { mimeType: 'text/plain', extension: 'txt', body: [header, '', ...merged].join('\n') };
  },
};

export const proExporters: readonly Exporter<GitignoreArtifact>[] = [
  regexExporter,
  mergedExporter,
];
