import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildColorRegistration,
  FIXED_CLOCK,
  COLOR_KIND_PARSED,
  type ColorParsedArtifact,
  type ParsedColor,
} from '@nekotools/lens-color';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoColor UI parse helper, extracted out of ColorApp for testability.
 * Free output strings come from the real engine exporters. The Pro palette +
 * CSS custom-properties exports are gated: `runExporter` throws
 * EntitlementError for a free caller, surfaced here as null so the UI shows
 * the Pro-lock (same pattern as hex-parse.ts / csv-parse.ts).
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
  /** Pro: a 50–900 tint/shade markdown palette, or null when not entitled. */
  readonly palette: string | null;
  /** Pro: :root CSS custom properties for the scale(s), or null when not entitled. */
  readonly cssVars: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseColorInput(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedColorView {
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
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'color', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    count: value?.count ?? 0,
    colors: value?.colors ?? [],
    json: run('color.export.json', '{}'),
    normalized: run('color.export.normalized', ''),
    markdown: run('color.export.markdown.summary', ''),
    palette: runPro('color.export.palette'),
    cssVars: runPro('color.export.css-vars'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
  };
}
