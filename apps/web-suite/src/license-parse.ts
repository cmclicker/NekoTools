import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildLicenseRegistration,
  FIXED_CLOCK,
  LICENSE_KIND_PARSED,
  type LicenseMeta,
  type LicenseParsedArtifact,
} from '@nekotools/lens-license';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoLicense UI parse helper, extracted out of LicenseApp for testability.
 * Output strings come from the real engine exporters. The Pro compatibility
 * matrix + NOTICE generator are gated: `runExporter` throws EntitlementError
 * for a free caller, surfaced here as null so the UI shows the Pro-lock.
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildLicenseRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedLicenseView {
  readonly primary: string | null;
  readonly spdxTag: string | null;
  readonly matches: readonly string[];
  readonly meta: LicenseMeta | null;
  readonly json: string;
  readonly markdown: string;
  /** Pro: license compatibility matrix (markdown), or null when not entitled. */
  readonly compatibility: string | null;
  /** Pro: NOTICE / attribution entry, or null when not entitled. */
  readonly notice: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseLicenseInput(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedLicenseView {
  const result = runParser(registry, 'license', 'license.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });

  const artifact = result.artifacts.find(
    (a): a is LicenseParsedArtifact => a.kind === LICENSE_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'license', id, exportInput).body) : fallback;
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'license', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    primary: value?.primary ?? null,
    spdxTag: value?.spdxTag ?? null,
    matches: value?.matches ?? [],
    meta: value?.meta ?? null,
    json: run('license.export.json', 'null'),
    markdown: run('license.export.markdown.summary', ''),
    compatibility: runPro('license.export.compatibility'),
    notice: runPro('license.export.notice'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
  };
}
