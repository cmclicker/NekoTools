import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildDiffRegistration,
  DIFF_KIND_RESULT,
  FIXED_CLOCK,
  type DiffMode,
  type DiffResult,
  type DiffResultArtifact,
} from '@nekotools/lens-diff';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

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
  /** Pro: token/key-level semantic diff (markdown), or null when not entitled. */
  readonly semantic: string | null;
  /**
   * Pro: canonical signable bundle (JSON), or null when not entitled. The UI
   * never signs — this is the unsigned bundle (`signature: null`).
   */
  readonly signedBundle: string | null;
  readonly proUnlocked: boolean;
}

/**
 * Compare two raw inputs under the given mode and render every export. The
 * three free exports always render; the two Pro exports (`diff.export.semantic`
 * and `diff.export.bundle.signed`) are gated: `runExporter` throws
 * EntitlementError for a free caller, surfaced here as null so the UI shows the
 * Pro-lock (same pattern as hex-parse.ts). The signed bundle is requested
 * WITHOUT options, so it is the canonical UNSIGNED signable bundle — the UI
 * never signs.
 */
export function computeDiff(
  left: string,
  right: string,
  mode: DiffMode,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): DiffOutput {
  const result = runParser(registry, 'diff', PARSER_BY_MODE[mode], {
    raw: '',
    source: { kind: 'derived', from: ['left', 'right'] },
    hints: { leftText: left, rightText: right },
  });

  const artifact = result.artifacts.find(
    (a): a is DiffResultArtifact => a.kind === DIFF_KIND_RESULT,
  );

  const proUnlocked = entitlement.tier !== 'free';

  if (artifact === undefined) {
    return {
      result: null,
      diagnostics: result.diagnostics,
      unified: null,
      jsonSummary: null,
      markdown: null,
      semantic: null,
      signedBundle: null,
      proUnlocked,
    };
  }

  const exportInput = { artifacts: [artifact], diagnostics: result.diagnostics };
  const runPro = (id: string): string | null => {
    try {
      return String(runExporter(registry, 'diff', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    result: artifact.value,
    diagnostics: result.diagnostics,
    unified: String(runExporter(registry, 'diff', 'diff.export.unified', exportInput).body),
    jsonSummary: String(runExporter(registry, 'diff', 'diff.export.json', exportInput).body),
    markdown: String(
      runExporter(registry, 'diff', 'diff.export.markdown.summary', exportInput).body,
    ),
    semantic: runPro('diff.export.semantic'),
    signedBundle: runPro('diff.export.bundle.signed'),
    proUnlocked,
  };
}
