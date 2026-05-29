import type { Exporter } from '@nekotools/contracts';

import {
  CODEC_KIND_TRANSFORM,
  CODEC_TRANSFORM_EXPORT_KINDS,
  type CodecArtifact,
  type CodecTransformArtifact,
} from './kinds.js';

const TOOL_ID = 'codec';

function pickTransform(
  artifacts: readonly CodecArtifact[],
): CodecTransformArtifact | undefined {
  return artifacts.find((a): a is CodecTransformArtifact => a.kind === CODEC_KIND_TRANSFORM);
}

/** The transformed output text, verbatim (empty when there is none). */
export const textExporter: Exporter<CodecArtifact> = {
  version: 1,
  id: 'codec.export.text',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: CODEC_TRANSFORM_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const t = pickTransform(artifacts);
    return { mimeType: 'text/plain', extension: 'txt', body: t?.value.output ?? '' };
  },
};

/** A machine-readable summary of the transform. */
export const jsonSummaryExporter: Exporter<CodecArtifact> = {
  version: 1,
  id: 'codec.export.summary.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: CODEC_TRANSFORM_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const t = pickTransform(artifacts);
    const summary = t
      ? {
          operation: t.value.operation,
          codec: t.value.codec,
          ok: t.value.ok,
          inputBytes: t.value.inputBytes,
          outputBytes: t.value.outputBytes,
          looksBinary: t.value.looksBinary,
          output: t.value.output,
        }
      : {};
    return {
      mimeType: 'application/json',
      extension: 'json',
      body: JSON.stringify(summary, null, 2),
    };
  },
};

/** A human-readable Markdown summary, including diagnostics. */
export const markdownSummaryExporter: Exporter<CodecArtifact> = {
  version: 1,
  id: 'codec.export.summary.markdown',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: CODEC_TRANSFORM_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const t = pickTransform(artifacts);
    const lines: string[] = ['# NekoCodec export', ''];
    if (t) {
      lines.push(
        `- **operation** — ${t.value.operation}`,
        `- **codec** — ${t.value.codec}`,
        `- **status** — ${t.value.ok ? 'ok' : 'failed'}`,
        `- **input bytes** — ${t.value.inputBytes}`,
        `- **output bytes** — ${t.value.outputBytes}`,
        `- **binary-looking** — ${t.value.looksBinary ? 'yes' : 'no'}`,
        '',
        '## Output',
        '',
        '```',
        t.value.output ?? '(no output)',
        '```',
        '',
      );
    } else {
      lines.push('(no transform)', '');
    }
    if (diagnostics.length > 0) {
      lines.push('## Diagnostics', '');
      for (const d of diagnostics) {
        lines.push(`- **${d.severity.toUpperCase()}** \`${d.code}\` — ${d.message}`);
      }
      lines.push('');
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

/**
 * Free exporters: transformed text, JSON summary, Markdown summary.
 * Pro exporters (batch report, signed recipe bundle) are declared in the
 * manifest as advertising but are not registered here.
 */
export const freeExporters: readonly Exporter<CodecArtifact>[] = [
  textExporter,
  jsonSummaryExporter,
  markdownSummaryExporter,
];
