import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import { buildJsonRegistration, FIXED_CLOCK } from '@nekotools/lens-json';
import type { JsonDocumentArtifact } from '@nekotools/lens-json';
import type { Entitlement } from '@nekotools/contracts';

/**
 * NekoJSON Pro UI adapter. The free views (tree / text / table) are driven by
 * the shared `parse-input.ts` glue inside `JsonApp`; this adapter adds ONLY the
 * Pro code-generation exports — TypeScript types, a Zod schema, and a markdown
 * data dictionary — gated by entitlement.
 *
 * It re-runs `json.text` to obtain the `json.document` artifact the engine
 * exporters consume (rather than threading the artifact out of the shared
 * `parseInput`, which 25+ existing tests pin). Output strings come from the
 * real engine exporters, so the tab cannot drift from engine behavior.
 * `runExporter` throws EntitlementError for a free caller, surfaced here as
 * null so the UI shows the Pro-lock (same pattern as hex-parse.ts).
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildJsonRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface JsonProView {
  /** Pro: a TypeScript `type Root` from the document, or null when not entitled. */
  readonly typescript: string | null;
  /** Pro: a Zod `rootSchema` from the document, or null when not entitled. */
  readonly zod: string | null;
  /** Pro: a markdown path/type/sample data dictionary, or null when not entitled. */
  readonly dataDictionary: string | null;
  /** True iff the suite license unlocks Pro (mirrors hex-parse.ts). */
  readonly proUnlocked: boolean;
  /** True iff `json.text` produced a `json.document` artifact (i.e. valid JSON). */
  readonly hasDocument: boolean;
}

/** Run the Pro code-gen exporters for `raw` under the given entitlement. */
export function computeJsonPro(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): JsonProView {
  const result = runParser(registry, 'json', 'json.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
  const artifact = result.artifacts[0] as JsonDocumentArtifact | undefined;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'json', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    typescript: runPro('json.export.types.typescript'),
    zod: runPro('json.export.types.zod'),
    dataDictionary: runPro('json.export.docs.data-dictionary'),
    proUnlocked: entitlement.tier !== 'free',
    hasDocument: artifact !== undefined,
  };
}
