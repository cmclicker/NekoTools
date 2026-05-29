import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildSortRegistration,
  FIXED_CLOCK,
  SORT_KIND_PARSED,
  type SortOptions,
  type SortParsedArtifact,
} from '@nekotools/lens-sort';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoSort UI parse helper, extracted out of SortApp for testability. The
 * options are forwarded as parser hints; output strings come from the real
 * engine exporters.
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildSortRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedSortView {
  readonly inputCount: number;
  readonly outputCount: number;
  readonly removed: number;
  readonly result: string;
  readonly json: string;
  readonly markdown: string;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseSortInput(raw: string, options: SortOptions): ParsedSortView {
  const result = runParser(registry, 'sort', 'sort.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
    hints: { ...options },
  });

  const artifact = result.artifacts.find(
    (a): a is SortParsedArtifact => a.kind === SORT_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'sort', id, exportInput).body) : fallback;

  return {
    inputCount: value?.inputCount ?? 0,
    outputCount: value?.outputCount ?? 0,
    removed: value?.removed ?? 0,
    result: run('sort.export.normalized', ''),
    json: run('sort.export.json', 'null'),
    markdown: run('sort.export.markdown.summary', ''),
    diagnostics: result.diagnostics,
  };
}
