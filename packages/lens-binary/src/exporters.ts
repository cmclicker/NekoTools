import type { Exporter } from '@nekotools/contracts';

import { ALL_BINARY_KINDS, type BinaryArtifact } from './kinds.js';
import { toBatchReport, toByteMap } from './codegen.js';

const TOOL_ID = 'binary';

export const jsonExporter: Exporter<BinaryArtifact> = {
  version: 1,
  id: 'binary.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: ALL_BINARY_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts, diagnostics }) {
    return {
      mimeType: 'application/json',
      extension: 'json',
      body: JSON.stringify({ artifacts, diagnostics }, null, 2),
    };
  },
};

export const markdownExporter: Exporter<BinaryArtifact> = {
  version: 1,
  id: 'binary.export.markdown',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: ALL_BINARY_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const lines: string[] = ['# NekoBinary export', ''];
    if (artifacts.length > 0) {
      lines.push('## Artifacts', '');
      for (const a of artifacts) {
        lines.push(`- **${a.kind}** \`${a.id}\` — \`${formatValue(a)}\``);
      }
      lines.push('');
    }
    if (diagnostics.length > 0) {
      lines.push('## Diagnostics', '');
      for (const d of diagnostics) {
        lines.push(`- **${d.severity.toUpperCase()}** \`${d.code}\` — ${d.message}`);
      }
      lines.push('');
    }
    return {
      mimeType: 'text/markdown',
      extension: 'md',
      body: lines.join('\n'),
    };
  },
};

export const plaintextExporter: Exporter<BinaryArtifact> = {
  version: 1,
  id: 'binary.export.plaintext',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: ALL_BINARY_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts, diagnostics }) {
    const out: string[] = [];
    for (const a of artifacts) {
      out.push(`${a.kind}\t${a.id}\t${formatValue(a)}`);
    }
    for (const d of diagnostics) {
      out.push(`${d.severity}\t${d.code}\t${d.message}`);
    }
    return {
      mimeType: 'text/plain',
      extension: 'txt',
      body: out.join('\n'),
    };
  },
};

function formatValue(a: BinaryArtifact): string {
  if (a.kind === 'binary.number') return String(a.value);
  return String(a.value);
}

export const allExporters: readonly Exporter<BinaryArtifact>[] = [
  jsonExporter,
  markdownExporter,
  plaintextExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------
//
// These back the manifest's declared Pro exporter ids (`binary.export.byte-map`
// / `binary.export.batch.report`). Each derives purely from the
// already-parsed artifacts — no network, no clock, no premium-engine
// dependency. Code generation lives in `codegen.ts`. They accept every binary
// kind (like the free exporters) so the runtime's `accepts` check passes for
// number / bytes / text artifacts alike.

/**
 * `binary.export.byte-map` (Pro) — a byte map of the decoded bytes
 * (offset / hex / decimal / binary / ascii columns), a richer hexdump derived
 * from the first parsed artifact. Pro entitlement `export.byte-map`
 * (`inspect.byte-map`).
 */
export const byteMapExporter: Exporter<BinaryArtifact> = {
  version: 1,
  id: 'binary.export.byte-map',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: ALL_BINARY_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const first = artifacts[0];
    const body =
      first === undefined
        ? '# NekoBinary byte map\n\n_no artifacts to map_'
        : toByteMap(first);
    return { mimeType: 'text/markdown', extension: 'md', body };
  },
};

/**
 * `binary.export.batch.report` (Pro) — a report over every parsed artifact in
 * the input list: detected input representation, byte length, and a per-artifact
 * summary (value in each base + byte sum). Pro entitlement `export.batch.report`.
 */
export const batchReportExporter: Exporter<BinaryArtifact> = {
  version: 1,
  id: 'binary.export.batch.report',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: ALL_BINARY_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    return { mimeType: 'text/markdown', extension: 'md', body: toBatchReport(artifacts) };
  },
};

export const proExporters: readonly Exporter<BinaryArtifact>[] = [
  byteMapExporter,
  batchReportExporter,
];
