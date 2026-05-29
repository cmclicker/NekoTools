import type { Exporter } from '@nekotools/contracts';

import {
  UNICODE_KIND_PARSED,
  UNICODE_PARSED_EXPORT_KINDS,
  type UnicodeArtifact,
  type UnicodeParsedArtifact,
  type UnicodeReport,
} from './kinds.js';

const TOOL_ID = 'unicode';

function pickParsed(artifacts: readonly UnicodeArtifact[]): UnicodeParsedArtifact | undefined {
  return artifacts.find((a): a is UnicodeParsedArtifact => a.kind === UNICODE_KIND_PARSED);
}

/** `unicode.export.json` — the full per-codepoint breakdown + counts. */
export const jsonExporter: Exporter<UnicodeArtifact> = {
  version: 1,
  id: 'unicode.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: UNICODE_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? null;
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(value, null, 2) };
  },
};

/** `unicode.export.normalized` — the `U+XXXX` code points, space-separated. */
export const normalizedExporter: Exporter<UnicodeArtifact> = {
  version: 1,
  id: 'unicode.export.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: UNICODE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const cps = pickParsed(artifacts)?.value.codepoints ?? [];
    return { mimeType: 'text/plain', extension: 'txt', body: cps.map((c) => c.hex).join(' ') };
  },
};

/** `unicode.export.markdown.summary` — counts + a per-codepoint table. */
export const markdownSummaryExporter: Exporter<UnicodeArtifact> = {
  version: 1,
  id: 'unicode.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: UNICODE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value: UnicodeReport | undefined = pickParsed(artifacts)?.value;
    const cps = value?.codepoints ?? [];
    const lines: string[] = ['# NekoUnicode export', ''];
    if (value !== undefined) {
      lines.push(
        `- code points: ${value.codepointCount}`,
        `- UTF-16 units: ${value.utf16UnitCount}`,
        `- bytes (UTF-8): ${value.byteLength}`,
        '',
      );
    }
    if (cps.length > 0) {
      lines.push('| char | codepoint | dec | category | UTF-8 | escape |');
      lines.push('| --- | --- | ---: | --- | --- | --- |');
      for (const c of cps) {
        const display = c.isControl ? '·' : c.char;
        lines.push(`| \`${display}\` | ${c.hex} | ${c.decimal} | ${c.category} | ${c.utf8} | \`${c.jsEscape}\` |`);
      }
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<UnicodeArtifact>[] = [
  jsonExporter,
  normalizedExporter,
  markdownSummaryExporter,
];
