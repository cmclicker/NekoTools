import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildSemverRegistration,
  FIXED_CLOCK,
  SEMVER_KIND_PARSED,
  type ParsedVersion,
  type SemverParsedArtifact,
} from '@nekotools/lens-semver';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoSemver UI parse helper, extracted out of SemverApp for testability.
 * The `range` argument is forwarded as a parser hint so each version gets a
 * satisfies result; output strings come from the real engine exporters. The
 * Pro range-report + bump-plan exports are gated: `runExporter` throws
 * EntitlementError for a free caller, surfaced here as null so the UI shows
 * the Pro-lock (same pattern as hex-parse.ts).
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
  /** Pro: markdown range report (matching vs non-matching), or null when not entitled. */
  readonly rangeReport: string | null;
  /** Pro: markdown bump plan (candidate next versions), or null when not entitled. */
  readonly bumpPlan: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseSemverInput(
  raw: string,
  range: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedSemverView {
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
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'semver', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    count: value?.count ?? 0,
    range: value?.range ?? null,
    versions: value?.versions ?? [],
    sortedAscending: value?.sortedAscending ?? [],
    json: run('semver.export.json', '{}'),
    sorted: run('semver.export.sorted', ''),
    markdown: run('semver.export.markdown.summary', ''),
    rangeReport: runPro('semver.export.range.report'),
    bumpPlan: runPro('semver.export.bump.plan'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
  };
}
