import type { Exporter } from '@nekotools/contracts';

import type { LicenseCategory } from './license.js';
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

// --- Pro exporters (registered in the binary, gated by entitlement) --------

/**
 * Outbound compatibility verdict: can code under the detected license be
 * included in a larger work distributed under the target license? Deterministic
 * from license category — informational, NOT legal advice.
 */
type CompatVerdict = 'yes' | 'conditions' | 'no' | 'unknown';

const TARGET_LICENSES: readonly { id: string; category: LicenseCategory | 'proprietary' }[] = [
  { id: 'MIT / BSD / ISC (permissive)', category: 'permissive' },
  { id: 'Apache-2.0', category: 'permissive' },
  { id: 'MPL-2.0 (weak copyleft)', category: 'weak-copyleft' },
  { id: 'GPL-3.0 (copyleft)', category: 'copyleft' },
  { id: 'Proprietary / closed-source', category: 'proprietary' },
];

/** Can `source` be combined into a work distributed under `target`? */
function compatibility(
  source: LicenseCategory,
  target: LicenseCategory | 'proprietary',
): { verdict: CompatVerdict; note: string } {
  switch (source) {
    case 'public-domain':
      return { verdict: 'yes', note: 'public-domain — usable anywhere' };
    case 'permissive':
      return target === 'copyleft'
        ? { verdict: 'yes', note: 'permissive code may be relicensed under copyleft' }
        : { verdict: 'yes', note: 'attribution notice must be preserved' };
    case 'weak-copyleft':
      return target === 'proprietary'
        ? { verdict: 'conditions', note: 'keep the licensed files under their license + provide source for them' }
        : { verdict: 'conditions', note: 'file-level source-disclosure applies to the licensed files' };
    case 'copyleft':
      return target === 'copyleft'
        ? { verdict: 'yes', note: 'combining forces the whole work under this copyleft license' }
        : {
            verdict: 'no',
            note: 'including this code forces the entire work under the copyleft license',
          };
    default:
      return { verdict: 'unknown', note: 'classify manually' };
  }
}

const VERDICT_LABEL: Record<CompatVerdict, string> = {
  yes: '✓ yes',
  conditions: '⚠ with conditions',
  no: '✗ no',
  unknown: '? unknown',
};

/**
 * `license.export.compatibility` (Pro) — the `compatibility.matrix` capability:
 * a matrix of whether code under the detected license can be combined into a
 * larger work distributed under each common target license, with a note per
 * cell. Deterministic from license category. Pure + local; informational, not
 * legal advice.
 */
export const compatibilityExporter: Exporter<LicenseArtifact> = {
  version: 1,
  id: 'license.export.compatibility',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: LICENSE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value;
    const meta = value?.meta ?? null;
    const lines: string[] = ['# NekoLicense compatibility matrix', ''];
    lines.push(`- detected: ${value?.primary ?? '(unknown)'}`, '');
    if (meta === null) {
      lines.push('No known license detected — cannot compute compatibility.');
      lines.push('', '_Informational only — not legal advice._');
      return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
    }
    lines.push(
      `Can code under **${meta.spdxId}** (${meta.category}) be included in a work distributed under:`,
      '',
      '| target license | combinable? | note |',
      '| --- | --- | --- |',
    );
    for (const t of TARGET_LICENSES) {
      const { verdict, note } = compatibility(meta.category, t.category);
      lines.push(`| ${t.id} | ${VERDICT_LABEL[verdict]} | ${note} |`);
    }
    lines.push('', '_Informational only — not legal advice._');
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

/**
 * `license.export.notice` (Pro) — the `notice.generate` capability: a
 * ready-to-paste NOTICE / attribution entry for the detected license (name,
 * SPDX id, the conditions that require notice preservation, and a copyright
 * placeholder). Pure + local.
 */
export const noticeExporter: Exporter<LicenseArtifact> = {
  version: 1,
  id: 'license.export.notice',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: LICENSE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value;
    const meta = value?.meta ?? null;
    const lines: string[] = ['# NOTICE — third-party attribution (generated by NekoLicense)', ''];
    if (meta === null) {
      lines.push('# No known license detected — add attribution manually.');
      return { mimeType: 'text/plain', extension: 'txt', body: lines.join('\n') };
    }
    lines.push(
      `${meta.name} (${meta.spdxId})`,
      'Copyright (c) <year> <copyright holder>',
      '',
      `This product includes software licensed under ${meta.spdxId}.`,
    );
    if (meta.conditions.length > 0) {
      lines.push('', `Conditions: ${meta.conditions.join(', ')}.`);
    }
    return { mimeType: 'text/plain', extension: 'txt', body: lines.join('\n') };
  },
};

export const proExporters: readonly Exporter<LicenseArtifact>[] = [
  compatibilityExporter,
  noticeExporter,
];
