import type { Exporter } from '@nekotools/contracts';

import {
  CODEC_KIND_TRANSFORM,
  CODEC_TRANSFORM_EXPORT_KINDS,
  type CodecArtifact,
  type CodecTransform,
  type CodecTransformArtifact,
} from './kinds.js';
import { toBatchReport, toRecipeBundle } from './codegen.js';

const TOOL_ID = 'codec';

function pickTransform(
  artifacts: readonly CodecArtifact[],
): CodecTransformArtifact | undefined {
  return artifacts.find((a): a is CodecTransformArtifact => a.kind === CODEC_KIND_TRANSFORM);
}

/** Every parsed transform, in order — the batch exporters span them all. */
function pickTransforms(artifacts: readonly CodecArtifact[]): readonly CodecTransform[] {
  return artifacts
    .filter((a): a is CodecTransformArtifact => a.kind === CODEC_KIND_TRANSFORM)
    .map((a) => a.value);
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
 * Free exporters: transformed text, JSON summary, Markdown summary. The Pro
 * exporters (batch report + reusable recipe bundle) ship as gated
 * `proExporters` below.
 */
export const freeExporters: readonly Exporter<CodecArtifact>[] = [
  textExporter,
  jsonSummaryExporter,
  markdownSummaryExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------
//
// These back the manifest's declared Pro exporter ids. Each derives purely
// from the already-parsed `codec.transform` artifact(s) — no network, no
// premium-engine dependency, no signing/compression/hashing (out of scope).
// Generators live in `codegen.ts`. They span ALL parsed transforms ("batch").

/**
 * `codec.export.batch.report` (Pro, entitlement `batch.transform`) — a
 * Markdown report over every parsed transform: per-transform operation,
 * codec, byte sizes, status, binary-looking, plus a summary roll-up.
 */
export const batchReportExporter: Exporter<CodecArtifact> = {
  version: 1,
  id: 'codec.export.batch.report',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: CODEC_TRANSFORM_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    return {
      mimeType: 'text/markdown',
      extension: 'md',
      body: toBatchReport(pickTransforms(artifacts)),
    };
  },
};

/**
 * `codec.export.recipe.bundle` (Pro, entitlements `recipes.saved` /
 * `chain.transforms`) — a declarative JSON recipe capturing each parsed
 * transform's operation+codec as a reusable, re-appliable transform spec.
 * Describes the transform only; applies nothing new and is never signed.
 */
export const recipeBundleExporter: Exporter<CodecArtifact> = {
  version: 1,
  id: 'codec.export.recipe.bundle',
  toolId: TOOL_ID,
  target: 'json',
  accepts: CODEC_TRANSFORM_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    return {
      mimeType: 'application/json',
      extension: 'json',
      body: JSON.stringify(toRecipeBundle(pickTransforms(artifacts)), null, 2),
    };
  },
};

export const proExporters: readonly Exporter<CodecArtifact>[] = [
  batchReportExporter,
  recipeBundleExporter,
];
