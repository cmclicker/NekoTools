import type { Exporter } from '@nekotools/contracts';

import {
  MIME_KIND_PARSED,
  MIME_PARSED_EXPORT_KINDS,
  type MimeArtifact,
  type MimeParsedArtifact,
  type MimeReport,
} from './kinds.js';
import { toCsv, toIanaLookupMarkdown } from './codegen.js';

const TOOL_ID = 'mime';

function pickParsed(artifacts: readonly MimeArtifact[]): MimeParsedArtifact | undefined {
  return artifacts.find((a): a is MimeParsedArtifact => a.kind === MIME_KIND_PARSED);
}

/** `mime.export.json` — the full per-entry breakdown. */
export const jsonExporter: Exporter<MimeArtifact> = {
  version: 1,
  id: 'mime.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: MIME_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? { count: 0, entries: [] };
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(value, null, 2) };
  },
};

/** `mime.export.normalized` — the essence (type/subtype), one per line. */
export const normalizedExporter: Exporter<MimeArtifact> = {
  version: 1,
  id: 'mime.export.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: MIME_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const entries = pickParsed(artifacts)?.value.entries ?? [];
    const body = entries
      .map((e) => e.value?.essence)
      .filter((s): s is string => s !== undefined && s !== null)
      .join('\n');
    return { mimeType: 'text/plain', extension: 'txt', body };
  },
};

/** `mime.export.markdown.summary` — a per-entry table. */
export const markdownSummaryExporter: Exporter<MimeArtifact> = {
  version: 1,
  id: 'mime.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: MIME_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value: MimeReport | undefined = pickParsed(artifacts)?.value;
    const entries = value?.entries ?? [];
    const lines: string[] = ['# NekoMIME export', '', `- entries: ${entries.length}`, ''];
    if (entries.length > 0) {
      lines.push('| input | essence | tree | suffix | extensions |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const e of entries) {
        if (!e.valid || e.value === null) {
          lines.push(`| \`${e.input}\` | (invalid) | — | — | — |`);
          continue;
        }
        const v = e.value;
        lines.push(
          `| \`${e.input}\` | \`${v.essence}\` | ${v.tree} | ${v.suffix ?? '—'} | ${v.extensions.join(', ') || '—'} |`,
        );
      }
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<MimeArtifact>[] = [
  jsonExporter,
  normalizedExporter,
  markdownSummaryExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------
//
// These back the manifest's declared Pro exporter ids (`export.iana-lookup` /
// `export.csv`). Each derives purely from the decoded `mime.parsed` report and
// the bundled IANA common-subset table — no network, no premium-engine
// dependency. Code generation lives in `codegen.ts`; the bundled subset (a
// static `const`, never fetched) lives in `iana-data.ts`.

/**
 * `mime.export.iana-lookup` (Pro) — a Markdown report resolving each parsed
 * entry's essence against the bundled IANA subset (canonical name, file
 * extensions, category). Entitlement `export.iana-lookup` / `lookup.iana-full`.
 */
export const ianaLookupExporter: Exporter<MimeArtifact> = {
  version: 1,
  id: 'mime.export.iana-lookup',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: MIME_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const body = toIanaLookupMarkdown(pickParsed(artifacts)?.value);
    return { mimeType: 'text/markdown', extension: 'md', body };
  },
};

/**
 * `mime.export.csv` (Pro) — an RFC-4180 CSV grid, one row per parsed entry
 * (input, valid, type, subtype, suffix, parameters, extensions, category).
 * Entitlement `export.csv`.
 */
export const csvExporter: Exporter<MimeArtifact> = {
  version: 1,
  id: 'mime.export.csv',
  toolId: TOOL_ID,
  target: 'csv',
  accepts: MIME_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/csv',
  producesExtension: 'csv',
  export({ artifacts }) {
    const body = toCsv(pickParsed(artifacts)?.value);
    return { mimeType: 'text/csv', extension: 'csv', body };
  },
};

export const proExporters: readonly Exporter<MimeArtifact>[] = [
  ianaLookupExporter,
  csvExporter,
];
