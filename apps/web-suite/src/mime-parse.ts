import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildMimeRegistration,
  FIXED_CLOCK,
  MIME_KIND_PARSED,
  type MimeEntry,
  type MimeParsedArtifact,
} from '@nekotools/lens-mime';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoMIME UI parse helper, extracted out of MimeApp for testability.
 * Output strings come from the real engine exporters. The Pro IANA-lookup +
 * CSV exports are gated: `runExporter` throws EntitlementError for a free
 * caller, surfaced here as null so the UI shows the Pro-lock (same pattern as
 * hex-parse.ts).
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildMimeRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedMimeView {
  readonly count: number;
  readonly entries: readonly MimeEntry[];
  readonly json: string;
  readonly normalized: string;
  readonly markdown: string;
  /** Pro: a Markdown IANA-lookup report, or null when not entitled. */
  readonly ianaLookup: string | null;
  /** Pro: an RFC-4180 CSV grid, one row per entry, or null when not entitled. */
  readonly csv: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseMimeInput(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedMimeView {
  const result = runParser(registry, 'mime', 'mime.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });

  const artifact = result.artifacts.find(
    (a): a is MimeParsedArtifact => a.kind === MIME_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'mime', id, exportInput).body) : fallback;
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'mime', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    count: value?.count ?? 0,
    entries: value?.entries ?? [],
    json: run('mime.export.json', '{}'),
    normalized: run('mime.export.normalized', ''),
    markdown: run('mime.export.markdown.summary', ''),
    ianaLookup: runPro('mime.export.iana-lookup'),
    csv: runPro('mime.export.csv'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
  };
}
