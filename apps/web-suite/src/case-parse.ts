import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildCaseRegistration,
  FIXED_CLOCK,
  CASE_KIND_PARSED,
  type CaseEntry,
  type CaseParsedArtifact,
} from '@nekotools/lens-case';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoCase UI parse helper, extracted out of CaseApp for testability. Free
 * output strings come from the real engine exporters. The Pro CSV grid +
 * single-form exports are gated: `runExporter` throws EntitlementError for a
 * free caller, surfaced here as null so the UI shows the Pro-lock (same
 * pattern as csv-parse.ts / hex-parse.ts).
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildCaseRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedCaseView {
  readonly count: number;
  readonly entries: readonly CaseEntry[];
  readonly json: string;
  readonly normalized: string;
  readonly markdown: string;
  /** Pro: CSV grid of `input` + every case form, or null when not entitled. */
  readonly csv: string | null;
  /** Pro: one chosen case form (default camelCase) per line, or null. */
  readonly singleForm: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseCaseInput(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedCaseView {
  const result = runParser(registry, 'case', 'case.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });

  const artifact = result.artifacts.find(
    (a): a is CaseParsedArtifact => a.kind === CASE_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'case', id, exportInput).body) : fallback;
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'case', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    count: value?.count ?? 0,
    entries: value?.entries ?? [],
    json: run('case.export.json', '{}'),
    normalized: run('case.export.normalized', ''),
    markdown: run('case.export.markdown.summary', ''),
    csv: runPro('case.export.csv'),
    singleForm: runPro('case.export.single-form'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
  };
}
