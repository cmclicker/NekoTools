import type { Diagnostic, Entitlement } from '@nekotools/contracts';
import {
  PACKAGE_KIND_MANIFEST,
  buildPackageRegistration,
  type PackageManifestArtifact,
  type PackageManifestDocument,
} from '@nekotools/lens-package';
import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';

const SHARED_UTF8_ENCODER = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildPackageRegistration());
  return r;
})();

export interface PackageRun {
  readonly manifest: PackageManifestDocument | null;
  readonly jsonSummary: string | null;
  readonly markdownSummary: string | null;
  /** Pro: dependency & license-risk policy report (markdown), or null when not entitled. */
  readonly policyReport: string | null;
  /** Pro: CI guard gate config (JSON), or null when not entitled. */
  readonly ciGuard: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

/**
 * Run `package.json` over raw input and render the engine's exporters. The
 * free summaries always render; the Pro policy report + SARIF render only for
 * a Pro entitlement (otherwise null — `runExporter` throws EntitlementError,
 * surfaced here as null so the UI shows the Pro-lock). Pure-local; no network.
 */
export function runPackage(raw: string, entitlement: Entitlement = FREE_ENTITLEMENT): PackageRun {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'package', 'package.json', {
    raw,
    source: { kind: 'paste', bytes },
  });

  const artifact = result.artifacts.find(
    (a): a is PackageManifestArtifact => a.kind === PACKAGE_KIND_MANIFEST,
  );
  const input = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };

  const run = (id: string): string | null =>
    artifact ? String(runExporter(registry, 'package', id, input).body) : null;
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'package', id, input, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    manifest: artifact?.value ?? null,
    jsonSummary: run('package.export.summary.json'),
    markdownSummary: run('package.export.markdown.summary'),
    policyReport: runPro('package.export.policy.report'),
    ciGuard: runPro('package.export.ci.guard'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}
