import type { Exporter } from '@nekotools/contracts';

import {
  LICENSE_KIND_PARSED,
  LICENSE_PARSED_EXPORT_KINDS,
  type LicenseArtifact,
  type LicenseParsedArtifact,
  type LicenseReport,
} from './kinds.js';

const TOOL_ID = 'license';

function pickParsed(artifacts: readonly LicenseArtifact[]): LicenseParsedArtifact | undefined {
  return artifacts.find((a): a is LicenseParsedArtifact => a.kind === LICENSE_KIND_PARSED);
}

/** `license.export.json` — the detection result + metadata. */
export const jsonExporter: Exporter<LicenseArtifact> = {
  version: 1,
  id: 'license.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: LICENSE_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? null;
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(value, null, 2) };
  },
};

/** `license.export.normalized` — the detected SPDX id (or "UNKNOWN"). */
export const normalizedExporter: Exporter<LicenseArtifact> = {
  version: 1,
  id: 'license.export.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: LICENSE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const primary = pickParsed(artifacts)?.value.primary ?? null;
    return { mimeType: 'text/plain', extension: 'txt', body: primary ?? 'UNKNOWN' };
  },
};

/** `license.export.markdown.summary` — id + category + permissions/conditions/limitations. */
export const markdownSummaryExporter: Exporter<LicenseArtifact> = {
  version: 1,
  id: 'license.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: LICENSE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value: LicenseReport | undefined = pickParsed(artifacts)?.value;
    const lines: string[] = ['# NekoLicense export', ''];
    if (value === undefined || value.primary === null) {
      lines.push('- detected: (unknown)');
      if (value?.spdxTag) lines.push(`- SPDX tag: \`${value.spdxTag}\``);
      return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
    }
    lines.push(`- detected: \`${value.primary}\``);
    if (value.spdxTag) lines.push(`- SPDX tag: \`${value.spdxTag}\``);
    if (value.meta) {
      lines.push(
        `- name: ${value.meta.name}`,
        `- category: ${value.meta.category}`,
        '',
        `- **permissions:** ${value.meta.permissions.join(', ') || '—'}`,
        `- **conditions:** ${value.meta.conditions.join(', ') || '—'}`,
        `- **limitations:** ${value.meta.limitations.join(', ') || '—'}`,
      );
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<LicenseArtifact>[] = [
  jsonExporter,
  normalizedExporter,
  markdownSummaryExporter,
];
