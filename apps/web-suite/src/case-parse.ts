import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildCaseRegistration,
  FIXED_CLOCK,
  CASE_KIND_PARSED,
  type CaseEntry,
  type CaseParsedArtifact,
} from '@nekotools/lens-case';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoCase UI parse helper, extracted out of CaseApp for testability.
 * Output strings come from the real engine exporters.
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
  readonly diagnostics: readonly Diagnostic[];
}

export function parseCaseInput(raw: string): ParsedCaseView {
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

  return {
    count: value?.count ?? 0,
    entries: value?.entries ?? [],
    json: run('case.export.json', '{}'),
    normalized: run('case.export.normalized', ''),
    markdown: run('case.export.markdown.summary', ''),
    diagnostics: result.diagnostics,
  };
}
