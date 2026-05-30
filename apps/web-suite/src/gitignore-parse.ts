import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildGitignoreRegistration,
  FIXED_CLOCK,
  GITIGNORE_KIND_PARSED,
  type GitignoreParsedArtifact,
  type IgnoreRule,
  type PathResult,
} from '@nekotools/lens-gitignore';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoGitignore UI parse helper, extracted out of GitignoreApp for
 * testability. The `paths` argument is forwarded as a parser hint so the
 * engine returns ignored/not verdicts; output strings come from the real
 * engine exporters. The Pro secret-coverage audit + SARIF are gated:
 * `runExporter` throws EntitlementError for a free caller, surfaced as null.
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
  /** Pro: secret-coverage audit report (markdown), or null when not entitled. */
  readonly auditReport: string | null;
  /** Pro: SARIF 2.1.0 of the coverage audit, or null when not entitled. */
  readonly sarif: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseGitignoreInput(
  raw: string,
  paths: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedGitignoreView {
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
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'gitignore', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    rules: value?.rules ?? [],
    patternCount: value?.patternCount ?? 0,
    commentCount: value?.commentCount ?? 0,
    paths: value?.paths ?? [],
    json: run('gitignore.export.json', '{}'),
    normalized: run('gitignore.export.normalized', ''),
    markdown: run('gitignore.export.markdown.summary', ''),
    auditReport: runPro('gitignore.export.audit.report'),
    sarif: runPro('gitignore.export.sarif'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
  };
}
