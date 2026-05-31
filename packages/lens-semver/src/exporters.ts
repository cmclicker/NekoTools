import type { Exporter } from '@nekotools/contracts';

import {
  SEMVER_KIND_PARSED,
  SEMVER_PARSED_EXPORT_KINDS,
  type SemverArtifact,
  type SemverParsedArtifact,
  type SemverReport,
} from './kinds.js';
import { bumpPlan, rangeReport } from './codegen.js';

const TOOL_ID = 'semver';

const EMPTY_REPORT: SemverReport = { count: 0, range: null, versions: [], sortedAscending: [] };

function pickParsed(artifacts: readonly SemverArtifact[]): SemverParsedArtifact | undefined {
  return artifacts.find((a): a is SemverParsedArtifact => a.kind === SEMVER_KIND_PARSED);
}

/** `semver.export.json` — full breakdown (versions, range, sort order). */
export const jsonExporter: Exporter<SemverArtifact> = {
  version: 1,
  id: 'semver.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: SEMVER_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? { count: 0, range: null, versions: [], sortedAscending: [] };
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(value, null, 2) };
  },
};

/** `semver.export.sorted` — valid versions in ascending precedence, one per line. */
export const sortedExporter: Exporter<SemverArtifact> = {
  version: 1,
  id: 'semver.export.sorted',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: SEMVER_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const sorted = pickParsed(artifacts)?.value.sortedAscending ?? [];
    return { mimeType: 'text/plain', extension: 'txt', body: sorted.join('\n') };
  },
};

/** `semver.export.markdown.summary` — a per-version table + sort order. */
export const markdownSummaryExporter: Exporter<SemverArtifact> = {
  version: 1,
  id: 'semver.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: SEMVER_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value: SemverReport | undefined = pickParsed(artifacts)?.value;
    const versions = value?.versions ?? [];
    const lines: string[] = ['# NekoSemver export', '', `- versions: ${versions.length}`];
    if (value?.range != null) lines.push(`- range: \`${value.range}\``);
    lines.push('');

    if (versions.length > 0) {
      const hasRange = value?.range != null;
      lines.push(`| input | valid | normalized | prerelease |${hasRange ? ' satisfies |' : ''}`);
      lines.push(`| --- | --- | --- | --- |${hasRange ? ' --- |' : ''}`);
      for (const v of versions) {
        const sat = v.satisfies === null ? '—' : v.satisfies ? 'yes' : 'no';
        lines.push(
          `| \`${v.input}\` | ${v.valid ? 'yes' : 'no'} | ${v.version ?? '—'} | ${
            v.components?.prerelease ?? '—'
          } |${hasRange ? ` ${sat} |` : ''}`,
        );
      }
    }

    if ((value?.sortedAscending.length ?? 0) > 0) {
      lines.push('', '## Ascending precedence', '');
      for (const s of value!.sortedAscending) lines.push(`- ${s}`);
    }

    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<SemverArtifact>[] = [
  jsonExporter,
  sortedExporter,
  markdownSummaryExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------
//
// These back the manifest's declared Pro exporter ids (`export.range.report` /
// `export.bump.plan`). Each derives purely from the already-parsed
// `semver.parsed` report — no network, no registry lookup, no commit history.
// Generation lives in `codegen.ts`.

/**
 * `semver.export.range.report` (Pro) — a markdown report of the parsed
 * versions against the parsed range, using the per-version `satisfies` data
 * the parser already computed (matching vs non-matching).
 */
export const rangeReportExporter: Exporter<SemverArtifact> = {
  version: 1,
  id: 'semver.export.range.report',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: SEMVER_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? EMPTY_REPORT;
    return { mimeType: 'text/markdown', extension: 'md', body: rangeReport(value) };
  },
};

/**
 * `semver.export.bump.plan` (Pro) — a markdown bump plan presenting the
 * candidate next-major / next-minor / next-patch versions computed from the
 * highest valid version's components (bump type is never inferred).
 */
export const bumpPlanExporter: Exporter<SemverArtifact> = {
  version: 1,
  id: 'semver.export.bump.plan',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: SEMVER_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? EMPTY_REPORT;
    return { mimeType: 'text/markdown', extension: 'md', body: bumpPlan(value) };
  },
};

export const proExporters: readonly Exporter<SemverArtifact>[] = [
  rangeReportExporter,
  bumpPlanExporter,
];
