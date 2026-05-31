import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  REGEX_KIND_MATCHSET,
  buildRegexRegistration,
  FIXED_CLOCK,
  type RegexMatchSet,
  type RegexMatchSetArtifact,
} from '@nekotools/lens-regex';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoRegex UI parse helper, extracted out of RegexApp for testability —
 * the same engine-adapter seam NekoJSON's `parse-input.ts`, NekoEnv's
 * `env-parse.ts`, NekoLogs' `logs-parse.ts`, and NekoYAML's `yaml-parse.ts`
 * provide.
 *
 * The registry is a module singleton so parser identity is stable across
 * App re-renders. Export strings come from the real engine exporters (not
 * re-derived in the UI), so the tab can't drift from the engine's output.
 *
 * The Pro structural-explanation + redaction-recipe exports are gated:
 * `runExporter` throws EntitlementError for a free caller, surfaced here as
 * null so the UI shows the Pro-lock (same pattern as hex-parse.ts /
 * headers-parse.ts).
 */

const SHARED_UTF8_ENCODER = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildRegexRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedRegex {
  /** The match analysis, or null when the run emitted no artifact. */
  readonly matchSet: RegexMatchSet | null;
  readonly diagnostics: readonly Diagnostic[];
  /** Full analysis as pretty JSON; null when there is no artifact. */
  readonly jsonExport: string | null;
  /** Markdown summary; null when there is no artifact. */
  readonly markdownExport: string | null;
  /** Pattern + flags literal; null when there is no artifact. */
  readonly patternExport: string | null;
  /** Pro: markdown structural explanation of the pattern, or null when not entitled. */
  readonly explain: string | null;
  /** Pro: declarative JSON redaction recipe, or null when not entitled. */
  readonly redactionRecipe: string | null;
  readonly proUnlocked: boolean;
}

/**
 * Run `regex.match` over (pattern, flags, sample) and render the engine's
 * JSON / markdown / pattern exporters. Pattern + flags travel as parser
 * hints; the sample is the raw input. The Pro explain + redaction-recipe
 * exporters are run through `runPro`, which yields null for a free caller.
 */
export function runRegex(
  pattern: string,
  flags: string,
  sample: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedRegex {
  const result = runParser(registry, 'regex', 'regex.match', {
    raw: sample,
    source: { kind: 'paste', bytes: utf8ByteLength(sample) },
    hints: { pattern, flags },
  });

  const artifact = result.artifacts.find(
    (a): a is RegexMatchSetArtifact => a.kind === REGEX_KIND_MATCHSET,
  );
  const exportInput = {
    artifacts: artifact ? [artifact] : [],
    diagnostics: result.diagnostics,
  };
  const run = (id: string): string | null =>
    artifact ? String(runExporter(registry, 'regex', id, exportInput).body) : null;
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'regex', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    matchSet: artifact?.value ?? null,
    diagnostics: result.diagnostics,
    jsonExport: run('regex.export.json'),
    markdownExport: run('regex.export.markdown.summary'),
    patternExport: run('regex.export.pattern'),
    explain: runPro('regex.export.explain'),
    redactionRecipe: runPro('regex.export.redaction.recipe'),
    proUnlocked: entitlement.tier !== 'free',
  };
}
