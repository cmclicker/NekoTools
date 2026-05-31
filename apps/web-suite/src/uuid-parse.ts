import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildUuidRegistration,
  FIXED_CLOCK,
  UUID_KIND_PARSED,
  type ParsedId,
  type UuidParsedArtifact,
} from '@nekotools/lens-uuid';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoUUID UI parse helper, extracted out of UuidApp for testability — the
 * same engine-adapter seam the other tools' `*-parse.ts` modules provide.
 * Output strings come from the real engine exporters so the tab can't drift.
 * The Pro namespace-report + bulk-CSV exports are gated: `runExporter` throws
 * EntitlementError for a free caller, surfaced here as null so the UI shows
 * the Pro-lock (same pattern as hex-parse.ts).
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildUuidRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedUuidView {
  readonly count: number;
  readonly ids: readonly ParsedId[];
  readonly json: string;
  readonly normalized: string;
  readonly markdown: string;
  /** Pro: a Markdown namespace report grouping the ids, or null when not entitled. */
  readonly namespaceReport: string | null;
  /** Pro: an RFC-4180 CSV grid, one row per id, or null when not entitled. */
  readonly bulkCsv: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseUuidInput(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedUuidView {
  const result = runParser(registry, 'uuid', 'uuid.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });

  const artifact = result.artifacts.find(
    (a): a is UuidParsedArtifact => a.kind === UUID_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'uuid', id, exportInput).body) : fallback;
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'uuid', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    count: value?.count ?? 0,
    ids: value?.ids ?? [],
    json: run('uuid.export.json', '{}'),
    normalized: run('uuid.export.normalized', ''),
    markdown: run('uuid.export.markdown.summary', ''),
    namespaceReport: runPro('uuid.export.namespace.report'),
    bulkCsv: runPro('uuid.export.bulk.csv'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
  };
}
