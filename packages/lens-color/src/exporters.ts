import type { Exporter } from '@nekotools/contracts';

import {
  COLOR_KIND_PARSED,
  COLOR_PARSED_EXPORT_KINDS,
  type ColorArtifact,
  type ColorParsedArtifact,
  type ColorReport,
} from './kinds.js';
import { toCssVars, toPalette } from './codegen.js';

const TOOL_ID = 'color';

function pickParsed(artifacts: readonly ColorArtifact[]): ColorParsedArtifact | undefined {
  return artifacts.find((a): a is ColorParsedArtifact => a.kind === COLOR_KIND_PARSED);
}

/** `color.export.json` — the full per-color breakdown. */
export const jsonExporter: Exporter<ColorArtifact> = {
  version: 1,
  id: 'color.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: COLOR_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? { count: 0, colors: [] };
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(value, null, 2) };
  },
};

/** `color.export.normalized` — normalized hex, one per line (invalid skipped). */
export const normalizedExporter: Exporter<ColorArtifact> = {
  version: 1,
  id: 'color.export.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: COLOR_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const colors = pickParsed(artifacts)?.value.colors ?? [];
    const body = colors
      .map((c) => c.hex)
      .filter((h): h is string => h !== null)
      .join('\n');
    return { mimeType: 'text/plain', extension: 'txt', body };
  },
};

/** `color.export.markdown.summary` — a per-color table incl. contrast. */
export const markdownSummaryExporter: Exporter<ColorArtifact> = {
  version: 1,
  id: 'color.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: COLOR_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value: ColorReport | undefined = pickParsed(artifacts)?.value;
    const colors = value?.colors ?? [];
    const lines: string[] = ['# NekoColor export', '', `- colors: ${colors.length}`, ''];
    if (colors.length > 0) {
      lines.push('| input | hex | rgb | hsl | vs white | vs black |');
      lines.push('| --- | --- | --- | --- | ---: | ---: |');
      for (const c of colors) {
        if (!c.valid) {
          lines.push(`| \`${c.input}\` | (invalid) | — | — | — | — |`);
          continue;
        }
        lines.push(
          `| \`${c.input}\` | \`${c.hex}\` | \`${c.rgb}\` | \`${c.hsl}\` | ${c.contrastWhite}:1 | ${c.contrastBlack}:1 |`,
        );
      }
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<ColorArtifact>[] = [
  jsonExporter,
  normalizedExporter,
  markdownSummaryExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------
//
// These back the manifest's declared Pro exporter ids (`palette.generate` /
// `export.css-vars`). Both are pure color math over the parsed colors — no
// network, no premium engine. Generators live in `codegen.ts`. The
// scale.generate / blend.mix / contrast-grid / colorblind.simulate Pro
// features stay advertising-only.

/** `color.export.palette` (Pro) — a 50–900 tint/shade palette per color. */
export const paletteExporter: Exporter<ColorArtifact> = {
  version: 1,
  id: 'color.export.palette',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: COLOR_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? { count: 0, colors: [] };
    return { mimeType: 'text/markdown', extension: 'md', body: toPalette(value) };
  },
};

/** `color.export.css-vars` (Pro) — :root custom properties for the scale(s). */
export const cssVarsExporter: Exporter<ColorArtifact> = {
  version: 1,
  id: 'color.export.css-vars',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: COLOR_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/css',
  producesExtension: 'css',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value ?? { count: 0, colors: [] };
    return { mimeType: 'text/css', extension: 'css', body: toCssVars(value) };
  },
};

export const proExporters: readonly Exporter<ColorArtifact>[] = [paletteExporter, cssVarsExporter];
