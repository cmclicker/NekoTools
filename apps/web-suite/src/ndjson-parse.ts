import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildNdjsonRegistration,
  FIXED_CLOCK,
  NDJSON_KIND_PARSED,
  type NdjsonField,
  type NdjsonParsedArtifact,
  type NdjsonRecord,
} from '@nekotools/lens-ndjson';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoNDJSON UI parse helper, extracted out of NdjsonApp for testability —
 * the same engine-adapter seam the other tools' `*-parse.ts` modules
 * provide. Output strings come from the real engine exporters. The Pro
 * JSON Schema + CSV exports are gated: `runExporter` throws EntitlementError
 * for a free caller, surfaced here as null so the UI shows the Pro-lock
 * (same pattern as hex-parse.ts).
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildNdjsonRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedNdjsonView {
  readonly count: number;
  readonly validCount: number;
  readonly invalidCount: number;
  readonly records: readonly NdjsonRecord[];
  readonly fields: readonly NdjsonField[];
  readonly json: string;
  readonly ndjson: string;
  readonly markdown: string;
  /** Pro: inferred JSON Schema for one record, or null when not entitled. */
  readonly schemaJson: string | null;
  /** Pro: valid object records flattened to a CSV grid, or null when not entitled. */
  readonly csv: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseNdjsonInput(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedNdjsonView {
  const result = runParser(registry, 'ndjson', 'ndjson.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });

  const artifact = result.artifacts.find(
    (a): a is NdjsonParsedArtifact => a.kind === NDJSON_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'ndjson', id, exportInput).body) : fallback;
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'ndjson', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    count: value?.count ?? 0,
    validCount: value?.validCount ?? 0,
    invalidCount: value?.invalidCount ?? 0,
    records: value?.records ?? [],
    fields: value?.fields ?? [],
    json: run('ndjson.export.json', '[]'),
    ndjson: run('ndjson.export.ndjson', ''),
    markdown: run('ndjson.export.markdown.summary', ''),
    schemaJson: runPro('ndjson.export.schema.json'),
    csv: runPro('ndjson.export.csv'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
  };
}
