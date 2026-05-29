import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildColorRegistration,
  FIXED_CLOCK,
  COLOR_KIND_PARSED,
  type ColorParsedArtifact,
  type ParsedColor,
} from '@nekotools/lens-color';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoColor UI parse helper, extracted out of ColorApp for testability.
 * Output strings come from the real engine exporters.
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildColorRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedColorView {
  readonly count: number;
  readonly colors: readonly ParsedColor[];
  readonly json: string;
  readonly normalized: string;
  readonly markdown: string;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseColorInput(raw: string): ParsedColorView {
  const result = runParser(registry, 'color', 'color.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });

  const artifact = result.artifacts.find(
    (a): a is ColorParsedArtifact => a.kind === COLOR_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'color', id, exportInput).body) : fallback;

  return {
    count: value?.count ?? 0,
    colors: value?.colors ?? [],
    json: run('color.export.json', '{}'),
    normalized: run('color.export.normalized', ''),
    markdown: run('color.export.markdown.summary', ''),
    diagnostics: result.diagnostics,
  };
}
