import type { Exporter } from '@nekotools/contracts';

import {
  PACKAGE_KIND_MANIFEST,
  PACKAGE_MANIFEST_EXPORT_KINDS,
  type PackageArtifact,
  type PackageManifestArtifact,
} from './kinds.js';

const TOOL_ID = 'package';

function pickManifest(
  artifacts: readonly PackageArtifact[],
): PackageManifestArtifact | undefined {
  return artifacts.find((artifact): artifact is PackageManifestArtifact => artifact.kind === PACKAGE_KIND_MANIFEST);
}

export const jsonSummaryExporter: Exporter<PackageArtifact> = {
  version: 1,
  id: 'package.export.summary.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: PACKAGE_MANIFEST_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts, diagnostics }) {
    const manifest = pickManifest(artifacts);
    const summary =
      manifest === undefined
        ? {}
        : {
            ...manifest.value,
            diagnostics: diagnostics.map((diagnostic) => ({
              severity: diagnostic.severity,
              code: diagnostic.code,
              message: diagnostic.message,
            })),
          };
    return {
      mimeType: 'application/json',
      extension: 'json',
      body: JSON.stringify(summary, null, 2),
    };
  },
};

export const markdownSummaryExporter: Exporter<PackageArtifact> = {
  version: 1,
  id: 'package.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: PACKAGE_MANIFEST_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const manifest = pickManifest(artifacts);
    const lines: string[] = ['# NekoPackage summary', ''];

    if (manifest === undefined) {
      lines.push('(no package manifest)', '');
    } else {
      const pkg = manifest.value;
      lines.push(
        `- **name** - ${pkg.name ?? '(missing)'}`,
        `- **version** - ${pkg.version ?? '(missing)'}`,
        `- **private** - ${pkg.private === null ? '(missing)' : String(pkg.private)}`,
        `- **package manager** - ${pkg.packageManager ?? '(missing)'}`,
        `- **dependencies** - ${pkg.dependencyCounts.total}`,
        `- **scripts** - ${pkg.scripts.length}`,
        '',
      );

      if (pkg.scripts.length > 0) {
        lines.push('## Scripts', '');
        for (const script of pkg.scripts) {
          const flags = script.riskFlags.length > 0 ? ` (${script.riskFlags.join(', ')})` : '';
          lines.push(`- \`${script.name}\`${flags}: \`${script.command}\``);
        }
        lines.push('');
      }

      if (pkg.dependencies.length > 0) {
        lines.push('## Dependencies', '');
        for (const dep of pkg.dependencies) {
          lines.push(`- \`${dep.name}\` ${dep.range} (${dep.section})`);
        }
        lines.push('');
      }
    }

    if (diagnostics.length > 0) {
      lines.push('## Diagnostics', '');
      for (const diagnostic of diagnostics) {
        lines.push(
          `- **${diagnostic.severity.toUpperCase()}** \`${diagnostic.code}\` - ${diagnostic.message}`,
        );
      }
      lines.push('');
    }

    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<PackageArtifact>[] = [
  jsonSummaryExporter,
  markdownSummaryExporter,
];
