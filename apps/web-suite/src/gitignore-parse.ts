import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildGitignoreRegistration,
  FIXED_CLOCK,
  GITIGNORE_KIND_PARSED,
  type GitignoreParsedArtifact,
  type IgnoreRule,
  type PathResult,
} from '@nekotools/lens-gitignore';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoGitignore UI parse helper, extracted out of GitignoreApp for
 * testability. The `paths` argument is forwarded as a parser hint so the
 * engine returns ignored/not verdicts; output strings come from the real
 * engine exporters.
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildGitignoreRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedGitignoreView {
  readonly rules: readonly IgnoreRule[];
  readonly patternCount: number;
  readonly commentCount: number;
  readonly paths: readonly PathResult[];
  readonly json: string;
  readonly normalized: string;
  readonly markdown: string;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseGitignoreInput(raw: string, paths: string): ParsedGitignoreView {
  const result = runParser(registry, 'gitignore', 'gitignore.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
    ...(paths.trim() !== '' ? { hints: { paths } } : {}),
  });

  const artifact = result.artifacts.find(
    (a): a is GitignoreParsedArtifact => a.kind === GITIGNORE_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'gitignore', id, exportInput).body) : fallback;

  return {
    rules: value?.rules ?? [],
    patternCount: value?.patternCount ?? 0,
    commentCount: value?.commentCount ?? 0,
    paths: value?.paths ?? [],
    json: run('gitignore.export.json', '{}'),
    normalized: run('gitignore.export.normalized', ''),
    markdown: run('gitignore.export.markdown.summary', ''),
    diagnostics: result.diagnostics,
  };
}
