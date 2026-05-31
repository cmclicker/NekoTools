import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildIniRegistration,
  FIXED_CLOCK,
  INI_KIND_PARSED,
  type IniParsedArtifact,
  type IniSection,
} from '@nekotools/lens-ini';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoINI UI parse helper, extracted out of IniApp for testability — the
 * same engine-adapter seam the other tools' `*-parse.ts` modules provide.
 * Output strings come from the real engine exporters.
 *
 * The Pro dotenv + TOML conversion exports are gated: `runExporter` throws
 * EntitlementError for a free caller, surfaced here as null so the UI shows
 * the Pro-lock (same pattern as hex-parse.ts / toml-parse.ts).
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildIniRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedIniView {
  readonly valid: boolean;
  readonly sections: readonly IniSection[];
  readonly sectionCount: number;
  readonly keyCount: number;
  readonly json: string;
  readonly normalized: string;
  readonly markdown: string;
  /** Pro: INI flattened to dotenv assignments, or null when not entitled. */
  readonly env: string | null;
  /** Pro: INI emitted as TOML tables, or null when not entitled. */
  readonly toml: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseIniInput(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedIniView {
  const result = runParser(registry, 'ini', 'ini.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });

  const artifact = result.artifacts.find(
    (a): a is IniParsedArtifact => a.kind === INI_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'ini', id, exportInput).body) : fallback;
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'ini', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    valid: value?.valid ?? false,
    sections: value?.sections ?? [],
    sectionCount: value?.sectionCount ?? 0,
    keyCount: value?.keyCount ?? 0,
    json: run('ini.export.json', '{}'),
    normalized: run('ini.export.normalized', ''),
    markdown: run('ini.export.markdown.summary', ''),
    env: runPro('ini.export.env'),
    toml: runPro('ini.export.toml'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
  };
}
