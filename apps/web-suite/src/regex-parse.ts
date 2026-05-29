import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  REGEX_KIND_MATCHSET,
  buildRegexRegistration,
  FIXED_CLOCK,
  type RegexMatchSet,
  type RegexMatchSetArtifact,
} from '@nekotools/lens-regex';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoRegex UI parse helper, extracted out of RegexApp for testability —
 * the same engine-adapter seam NekoJSON's `parse-input.ts`, NekoEnv's
 * `env-parse.ts`, NekoLogs' `logs-parse.ts`, and NekoYAML's `yaml-parse.ts`
 * provide.
 *
 * The registry is a module singleton so parser identity is stable across
 * App re-renders. Export strings come from the real engine exporters (not
 * re-derived in the UI), so the tab can't drift from the engine's output.
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
}

/**
 * Run `regex.match` over (pattern, flags, sample) and render the engine's
 * JSON / markdown / pattern exporters. Pattern + flags travel as parser
 * hints; the sample is the raw input.
 */
export function runRegex(pattern: string, flags: string, sample: string): ParsedRegex {
  const result = runParser(registry, 'regex', 'regex.match', {
    raw: sample,
    source: { kind: 'paste', bytes: utf8ByteLength(sample) },
    hints: { pattern, flags },
  });

  const artifact = result.artifacts.find(
    (a): a is RegexMatchSetArtifact => a.kind === REGEX_KIND_MATCHSET,
  );

  let jsonExport: string | null = null;
  let markdownExport: string | null = null;
  let patternExport: string | null = null;
  if (artifact !== undefined) {
    jsonExport = String(
      runExporter(registry, 'regex', 'regex.export.json', {
        artifacts: [artifact],
        diagnostics: result.diagnostics,
      }).body,
    );
    markdownExport = String(
      runExporter(registry, 'regex', 'regex.export.markdown.summary', {
        artifacts: [artifact],
        diagnostics: result.diagnostics,
      }).body,
    );
    patternExport = String(
      runExporter(registry, 'regex', 'regex.export.pattern', {
        artifacts: [artifact],
        diagnostics: result.diagnostics,
      }).body,
    );
  }

  return {
    matchSet: artifact?.value ?? null,
    diagnostics: result.diagnostics,
    jsonExport,
    markdownExport,
    patternExport,
  };
}
