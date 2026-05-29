import type { Exporter } from '@nekotools/contracts';

import {
  GLOBAL_SECTION,
  INI_KIND_PARSED,
  INI_PARSED_EXPORT_KINDS,
  type IniArtifact,
  type IniParsedArtifact,
  type ParsedIni,
} from './kinds.js';

const TOOL_ID = 'ini';

function pickParsed(artifacts: readonly IniArtifact[]): IniParsedArtifact | undefined {
  return artifacts.find((a): a is IniParsedArtifact => a.kind === INI_KIND_PARSED);
}

/** `ini.export.json` — the nested data object (global keys + sections). */
export const jsonExporter: Exporter<IniArtifact> = {
  version: 1,
  id: 'ini.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: INI_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const data = pickParsed(artifacts)?.value.data ?? {};
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(data, null, 2) };
  },
};

/** `ini.export.normalized` — canonical INI (global entries first, then sections). */
export const normalizedExporter: Exporter<IniArtifact> = {
  version: 1,
  id: 'ini.export.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: INI_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'ini',
  export({ artifacts }) {
    const sections = pickParsed(artifacts)?.value.sections ?? [];
    const blocks: string[] = [];

    const global = sections.find((s) => s.name === GLOBAL_SECTION);
    if (global && global.entries.length > 0) {
      blocks.push(global.entries.map((e) => `${e.key}=${e.value}`).join('\n'));
    }
    for (const section of sections) {
      if (section.name === GLOBAL_SECTION) continue;
      const lines = [`[${section.name}]`, ...section.entries.map((e) => `${e.key}=${e.value}`)];
      blocks.push(lines.join('\n'));
    }
    return { mimeType: 'text/plain', extension: 'ini', body: blocks.join('\n\n') };
  },
};

/** `ini.export.markdown.summary` — section/key counts + a per-section listing. */
export const markdownSummaryExporter: Exporter<IniArtifact> = {
  version: 1,
  id: 'ini.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: INI_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const value: ParsedIni | undefined = pickParsed(artifacts)?.value;
    const lines: string[] = ['# NekoINI export', ''];
    if (value === undefined || !value.valid) {
      lines.push('- valid: no');
    } else {
      lines.push(`- sections: ${value.sectionCount}`, `- keys: ${value.keyCount}`, '');
      for (const section of value.sections) {
        lines.push(`## ${section.name === GLOBAL_SECTION ? '(global)' : section.name}`, '');
        for (const e of section.entries) lines.push(`- \`${e.key}\` = \`${e.value}\``);
        lines.push('');
      }
    }
    if (diagnostics.length > 0) {
      lines.push('## Diagnostics', '');
      for (const d of diagnostics) lines.push(`- **${d.severity.toUpperCase()}** \`${d.code}\` — ${d.message}`);
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n').trimEnd() };
  },
};

export const freeExporters: readonly Exporter<IniArtifact>[] = [
  jsonExporter,
  normalizedExporter,
  markdownSummaryExporter,
];
