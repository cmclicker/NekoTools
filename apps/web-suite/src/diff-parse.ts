import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildDiffRegistration,
  DIFF_KIND_RESULT,
  FIXED_CLOCK,
  type DiffMode,
  type DiffResult,
  type DiffResultArtifact,
} from '@nekotools/lens-diff';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoDiff UI engine-adapter, extracted out of DiffApp for testability —
 * the same seam NekoJSON's `parse-input.ts`, NekoEnv's `env-parse.ts`, and
 * NekoYAML's `yaml-parse.ts` provide.
 *
 * The two sides arrive as raw text and are passed through `hints`, matching
 * the engine's hints-based diff parsers. Output strings come from the real
 * engine exporters (not re-derived in the UI), so the tab cannot drift from
 * the engine's behavior. The registry is a module singleton so parser
 * identity is stable across App re-renders.
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildDiffRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

const PARSER_BY_MODE: Record<DiffMode, string> = {
  text: 'diff.text',
  json: 'diff.json',
  yaml: 'diff.yaml',
};

export interface DiffOutput {
  readonly result: DiffResult | null;
  readonly diagnostics: readonly Diagnostic[];
  /** Unified-diff text, or null when no result was produced. */
  readonly unified: string | null;
  /** JSON summary string, or null when no result was produced. */
  readonly jsonSummary: string | null;
  /** Markdown summary string, or null when no result was produced. */
  readonly markdown: string | null;
}

/** Compare two raw inputs under the given mode and render every free export. */
export function computeDiff(left: string, right: string, mode: DiffMode): DiffOutput {
  const result = runParser(registry, 'diff', PARSER_BY_MODE[mode], {
    raw: '',
    source: { kind: 'derived', from: ['left', 'right'] },
    hints: { leftText: left, rightText: right },
  });

  const artifact = result.artifacts.find(
    (a): a is DiffResultArtifact => a.kind === DIFF_KIND_RESULT,
  );

  if (artifact === undefined) {
    return {
      result: null,
      diagnostics: result.diagnostics,
      unified: null,
      jsonSummary: null,
      markdown: null,
    };
  }

  const exportInput = { artifacts: [artifact], diagnostics: result.diagnostics };
  return {
    result: artifact.value,
    diagnostics: result.diagnostics,
    unified: String(runExporter(registry, 'diff', 'diff.export.unified', exportInput).body),
    jsonSummary: String(runExporter(registry, 'diff', 'diff.export.json', exportInput).body),
    markdown: String(
      runExporter(registry, 'diff', 'diff.export.markdown.summary', exportInput).body,
    ),
  };
}
