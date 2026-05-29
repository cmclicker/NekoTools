import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildSemverRegistration,
  FIXED_CLOCK,
  SEMVER_KIND_PARSED,
  type ParsedVersion,
  type SemverParsedArtifact,
} from '@nekotools/lens-semver';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoSemver UI parse helper, extracted out of SemverApp for testability.
 * The `range` argument is forwarded as a parser hint so each version gets a
 * satisfies result; output strings come from the real engine exporters.
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildSemverRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedSemverView {
  readonly count: number;
  readonly range: string | null;
  readonly versions: readonly ParsedVersion[];
  readonly sortedAscending: readonly string[];
  readonly json: string;
  readonly sorted: string;
  readonly markdown: string;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseSemverInput(raw: string, range: string): ParsedSemverView {
  const result = runParser(registry, 'semver', 'semver.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
    ...(range.trim() !== '' ? { hints: { range } } : {}),
  });

  const artifact = result.artifacts.find(
    (a): a is SemverParsedArtifact => a.kind === SEMVER_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'semver', id, exportInput).body) : fallback;

  return {
    count: value?.count ?? 0,
    range: value?.range ?? null,
    versions: value?.versions ?? [],
    sortedAscending: value?.sortedAscending ?? [],
    json: run('semver.export.json', '{}'),
    sorted: run('semver.export.sorted', ''),
    markdown: run('semver.export.markdown.summary', ''),
    diagnostics: result.diagnostics,
  };
}
