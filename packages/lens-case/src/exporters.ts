import type { Exporter } from '@nekotools/contracts';

import { CASE_FORMS } from './case.js';
import {
  CASE_KIND_PARSED,
  CASE_PARSED_EXPORT_KINDS,
  type CaseArtifact,
  type CaseParsedArtifact,
  type CaseReport,
} from './kinds.js';
import { toCsv, toSingleForm } from './codegen.js';

const TOOL_ID = 'case';

function pickParsed(artifacts: readonly CaseArtifact[]): CaseParsedArtifact | undefined {
  return artifacts.find((a): a is CaseParsedArtifact => a.kind === CASE_KIND_PARSED);
}

/** `case.export.json` — the full per-entry form set. */
export const jsonExporter: Exporter<CaseArtifact> = {
  version: 1,
  id: 'case.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: CASE_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? { count: 0, entries: [] };
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(value, null, 2) };
  },
};

/** `case.export.normalized` — the slug of each line, one per line. */
export const normalizedExporter: Exporter<CaseArtifact> = {
  version: 1,
  id: 'case.export.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: CASE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const entries = pickParsed(artifacts)?.value.entries ?? [];
    return { mimeType: 'text/plain', extension: 'txt', body: entries.map((e) => e.forms.slug).join('\n') };
  },
};

/** `case.export.markdown.summary` — a per-entry table of all forms. */
export const markdownSummaryExporter: Exporter<CaseArtifact> = {
  version: 1,
  id: 'case.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: CASE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value: CaseReport | undefined = pickParsed(artifacts)?.value;
    const entries = value?.entries ?? [];
    const lines: string[] = ['# NekoCase export', '', `- entries: ${entries.length}`, ''];
    if (entries.length > 0) {
      lines.push(`| input | ${CASE_FORMS.join(' | ')} |`);
      lines.push(`| --- | ${CASE_FORMS.map(() => '---').join(' | ')} |`);
      for (const e of entries) {
        lines.push(`| \`${e.input}\` | ${CASE_FORMS.map((f) => `\`${e.forms[f]}\``).join(' | ')} |`);
      }
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<CaseArtifact>[] = [
  jsonExporter,
  normalizedExporter,
  markdownSummaryExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------
//
// These back the manifest's declared Pro exporter ids (`export.csv` /
// `export.single-form`). Both are pure projections of the parsed case forms
// — no network, no premium engine. Generators live in `codegen.ts`. The
// custom-acronym, transliteration, and batch-rename Pro features stay
// advertising-only.

/** `case.export.csv` (Pro) — input + every case form as a CSV grid. */
export const csvExporter: Exporter<CaseArtifact> = {
  version: 1,
  id: 'case.export.csv',
  toolId: TOOL_ID,
  target: 'csv',
  accepts: CASE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/csv',
  producesExtension: 'csv',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? { count: 0, entries: [] };
    return { mimeType: 'text/csv', extension: 'csv', body: toCsv(value) };
  },
};

/** `case.export.single-form` (Pro) — one chosen case form, one per line. */
export const singleFormExporter: Exporter<CaseArtifact> = {
  version: 1,
  id: 'case.export.single-form',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: CASE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? { count: 0, entries: [] };
    return { mimeType: 'text/plain', extension: 'txt', body: toSingleForm(value) };
  },
};

export const proExporters: readonly Exporter<CaseArtifact>[] = [csvExporter, singleFormExporter];
