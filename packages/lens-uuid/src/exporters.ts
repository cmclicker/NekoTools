import type { Exporter } from '@nekotools/contracts';

import {
  UUID_KIND_PARSED,
  UUID_PARSED_EXPORT_KINDS,
  type UuidArtifact,
  type UuidParsedArtifact,
  type UuidReport,
} from './kinds.js';
import { toBulkCsv, toNamespaceReport } from './codegen.js';

const TOOL_ID = 'uuid';

function pickParsed(artifacts: readonly UuidArtifact[]): UuidParsedArtifact | undefined {
  return artifacts.find((a): a is UuidParsedArtifact => a.kind === UUID_KIND_PARSED);
}

/** `uuid.export.json` — the full per-id breakdown. */
export const jsonExporter: Exporter<UuidArtifact> = {
  version: 1,
  id: 'uuid.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: UUID_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? { count: 0, ids: [] };
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(value, null, 2) };
  },
};

/** `uuid.export.normalized` — canonical forms, one per line (invalid skipped). */
export const normalizedExporter: Exporter<UuidArtifact> = {
  version: 1,
  id: 'uuid.export.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: UUID_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const ids = pickParsed(artifacts)?.value.ids ?? [];
    const body = ids
      .map((i) => i.normalized)
      .filter((n): n is string => n !== null)
      .join('\n');
    return { mimeType: 'text/plain', extension: 'txt', body };
  },
};

/** `uuid.export.markdown.summary` — a per-id table. */
export const markdownSummaryExporter: Exporter<UuidArtifact> = {
  version: 1,
  id: 'uuid.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: UUID_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value: UuidReport | undefined = pickParsed(artifacts)?.value;
    const ids = value?.ids ?? [];
    const lines: string[] = ['# NekoUUID export', '', `- identifiers: ${ids.length}`, ''];

    if (ids.length > 0) {
      lines.push('| input | kind | version | variant | timestamp |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const i of ids) {
        const tag = i.isNil ? 'nil' : i.isMax ? 'max' : i.version !== null ? `v${i.version}` : '—';
        lines.push(
          `| \`${i.input}\` | ${i.kind} | ${tag} | ${i.variant ?? '—'} | ${i.timestamp ?? '—'} |`,
        );
      }
    }

    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<UuidArtifact>[] = [
  jsonExporter,
  normalizedExporter,
  markdownSummaryExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------
//
// These back the manifest's declared Pro exporter ids
// (`export.namespace.report` / `export.bulk.csv`). Each is a pure,
// deterministic projection of the already-parsed `uuid.parsed` ids[] — no
// network, no clock, no randomness, no premium-engine dependency. Generation
// logic lives in `codegen.ts`. They DESCRIBE the pasted ids only; nothing
// here generates identifiers, reverses v3/v5 name hashes, or extracts a v1
// node MAC (all out-of-scope per the manifest).

/**
 * `uuid.export.namespace.report` (Pro) — a Markdown report grouping the
 * parsed ids: per id its version, variant, and (for time-based versions) the
 * embedded UTC timestamp, plus a count summary by version. A report on what
 * was pasted, NOT namespace generation or hash reversal.
 */
export const namespaceReportExporter: Exporter<UuidArtifact> = {
  version: 1,
  id: 'uuid.export.namespace.report',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: UUID_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const ids = pickParsed(artifacts)?.value.ids ?? [];
    return { mimeType: 'text/markdown', extension: 'md', body: toNamespaceReport(ids) };
  },
};

/**
 * `uuid.export.bulk.csv` (Pro) — an RFC-4180 CSV grid, one row per parsed id
 * with columns input, valid, version, variant, normalized, timestamp, isNil,
 * isMax. A pure projection of ids[].
 */
export const bulkCsvExporter: Exporter<UuidArtifact> = {
  version: 1,
  id: 'uuid.export.bulk.csv',
  toolId: TOOL_ID,
  target: 'csv',
  accepts: UUID_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/csv',
  producesExtension: 'csv',
  export({ artifacts }) {
    const ids = pickParsed(artifacts)?.value.ids ?? [];
    return { mimeType: 'text/csv', extension: 'csv', body: toBulkCsv(ids) };
  },
};

export const proExporters: readonly Exporter<UuidArtifact>[] = [
  namespaceReportExporter,
  bulkCsvExporter,
];
