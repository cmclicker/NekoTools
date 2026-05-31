import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildUnicodeRegistration,
  FIXED_CLOCK,
  UNICODE_KIND_PARSED,
  type CodepointInfo,
  type UnicodeParsedArtifact,
} from '@nekotools/lens-unicode';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoUnicode UI parse helper, extracted out of UnicodeApp for testability.
 * Output strings come from the real engine exporters. The Pro names-table +
 * CSV exports are gated: `runExporter` throws EntitlementError for a free
 * caller, surfaced here as null so the UI shows the Pro-lock (same pattern as
 * hex-parse.ts).
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildUnicodeRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedUnicodeView {
  readonly codepointCount: number;
  readonly utf16UnitCount: number;
  readonly byteLength: number;
  readonly codepoints: readonly CodepointInfo[];
  readonly truncated: boolean;
  readonly json: string;
  readonly normalized: string;
  readonly markdown: string;
  /** Pro: a `U+XXXX | char | name` markdown table, or null when not entitled. */
  readonly names: string | null;
  /** Pro: an RFC-4180 per-codepoint CSV grid, or null when not entitled. */
  readonly csv: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseUnicodeInput(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedUnicodeView {
  const result = runParser(registry, 'unicode', 'unicode.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });

  const artifact = result.artifacts.find(
    (a): a is UnicodeParsedArtifact => a.kind === UNICODE_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'unicode', id, exportInput).body) : fallback;
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'unicode', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    codepointCount: value?.codepointCount ?? 0,
    utf16UnitCount: value?.utf16UnitCount ?? 0,
    byteLength: value?.byteLength ?? 0,
    codepoints: value?.codepoints ?? [],
    truncated: value?.truncated ?? false,
    json: run('unicode.export.json', 'null'),
    normalized: run('unicode.export.normalized', ''),
    markdown: run('unicode.export.markdown.summary', ''),
    names: runPro('unicode.export.names'),
    csv: runPro('unicode.export.csv'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
  };
}
