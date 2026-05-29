import type { Diagnostic } from '@nekotools/contracts';
import {
  PACKAGE_KIND_MANIFEST,
  buildPackageRegistration,
  type PackageManifestArtifact,
  type PackageManifestDocument,
} from '@nekotools/lens-package';
import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';

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
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

export function runPackage(raw: string): PackageRun {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'package', 'package.json', {
    raw,
    source: { kind: 'paste', bytes },
  });

  const artifact = result.artifacts.find(
    (a): a is PackageManifestArtifact => a.kind === PACKAGE_KIND_MANIFEST,
  );

  let jsonSummary: string | null = null;
  let markdownSummary: string | null = null;
  if (artifact !== undefined) {
    jsonSummary = String(
      runExporter(registry, 'package', 'package.export.summary.json', {
        artifacts: [artifact],
        diagnostics: result.diagnostics,
      }).body,
    );
    markdownSummary = String(
      runExporter(registry, 'package', 'package.export.markdown.summary', {
        artifacts: [artifact],
        diagnostics: result.diagnostics,
      }).body,
    );
  }

  return {
    manifest: artifact?.value ?? null,
    jsonSummary,
    markdownSummary,
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}
