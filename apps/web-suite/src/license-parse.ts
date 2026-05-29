import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildLicenseRegistration,
  FIXED_CLOCK,
  LICENSE_KIND_PARSED,
  type LicenseMeta,
  type LicenseParsedArtifact,
} from '@nekotools/lens-license';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoLicense UI parse helper, extracted out of LicenseApp for testability.
 * Output strings come from the real engine exporters.
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
  readonly diagnostics: readonly Diagnostic[];
}

export function parseLicenseInput(raw: string): ParsedLicenseView {
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

  return {
    primary: value?.primary ?? null,
    spdxTag: value?.spdxTag ?? null,
    matches: value?.matches ?? [],
    meta: value?.meta ?? null,
    json: run('license.export.json', 'null'),
    markdown: run('license.export.markdown.summary', ''),
    diagnostics: result.diagnostics,
  };
}
