import type { Exporter } from '@nekotools/contracts';

import {
  HASH_DIGEST_EXPORT_KINDS,
  HASH_KIND_DIGEST,
  type HashArtifact,
  type HashDigest,
  type HashDigestArtifact,
} from './kinds.js';
import { buildChecksumProfile, renderChecksumProfileJson, toChecksumManifest } from './codegen.js';

const TOOL_ID = 'hash';

function pickDigests(artifacts: readonly HashArtifact[]): readonly HashDigestArtifact[] {
  return artifacts.filter((a): a is HashDigestArtifact => a.kind === HASH_KIND_DIGEST);
}

/** The already-computed digest values, in artifact order. Both the free and
 * Pro exporters read these directly — none of them recompute a hash. */
function digestValues(artifacts: readonly HashArtifact[]): readonly HashDigest[] {
  return pickDigests(artifacts).map((a) => a.value);
}

/** The raw hex digest(s), one per line — the classic checksum line. */
export const digestExporter: Exporter<HashArtifact> = {
  version: 1,
  id: 'hash.export.digest',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: HASH_DIGEST_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const body = pickDigests(artifacts)
      .map((d) => d.value.hex)
      .join('\n');
    return { mimeType: 'text/plain', extension: 'txt', body };
  },
};

/** A structured JSON summary: algorithm, hex, base64, input byte length. */
export const jsonSummaryExporter: Exporter<HashArtifact> = {
  version: 1,
  id: 'hash.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: HASH_DIGEST_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const summaries = pickDigests(artifacts).map((d) => ({
      tool: 'NekoHash',
      algorithm: d.value.algorithm,
      hex: d.value.hex,
      base64: d.value.base64,
      inputBytes: d.value.inputBytes,
    }));
    const payload = summaries.length === 1 ? summaries[0] : summaries;
    return {
      mimeType: 'application/json',
      extension: 'json',
      body: JSON.stringify(payload, null, 2),
    };
  },
};

/** A human-readable Markdown summary, including any diagnostics. */
export const markdownSummaryExporter: Exporter<HashArtifact> = {
  version: 1,
  id: 'hash.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: HASH_DIGEST_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const lines: string[] = ['# NekoHash digest', ''];
    for (const d of pickDigests(artifacts)) {
      lines.push(
        `- **algorithm**: ${d.value.algorithm}`,
        `- **input bytes**: ${d.value.inputBytes}`,
        `- **hex**: \`${d.value.hex}\``,
        `- **base64**: \`${d.value.base64}\``,
        '',
      );
    }
    if (diagnostics.length > 0) {
      lines.push('## Diagnostics', '');
      for (const dg of diagnostics) {
        lines.push(`- **${dg.severity.toUpperCase()}** \`${dg.code}\` — ${dg.message}`);
      }
      lines.push('');
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<HashArtifact>[] = [
  digestExporter,
  jsonSummaryExporter,
  markdownSummaryExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------
//
// These back the manifest's declared Pro exporter ids (`hash.export.manifest`
// → entitlement `manifest.batch`; `hash.export.checksum.profile` →
// entitlement `verify.profiles`). Each is a pure, synchronous projection of
// the digests ALREADY computed on `hash.digest` artifacts — no Web Crypto, no
// recomputation, no network. Generation lives in `codegen.ts`.

/** `hash.export.manifest` (Pro) — a `sha256sum`-style `<hex>  <name>`
 * checksum manifest, one line per already-computed digest. */
export const manifestExporter: Exporter<HashArtifact> = {
  version: 1,
  id: 'hash.export.manifest',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: HASH_DIGEST_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    return {
      mimeType: 'text/plain',
      extension: 'txt',
      body: toChecksumManifest(digestValues(artifacts)),
    };
  },
};

/** `hash.export.checksum.profile` (Pro) — a JSON verification profile of the
 * already-computed digests (per algorithm: hex + base64 + input bytes). */
export const checksumProfileExporter: Exporter<HashArtifact> = {
  version: 1,
  id: 'hash.export.checksum.profile',
  toolId: TOOL_ID,
  target: 'json',
  accepts: HASH_DIGEST_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const profile = buildChecksumProfile(digestValues(artifacts));
    return {
      mimeType: 'application/json',
      extension: 'json',
      body: renderChecksumProfileJson(profile),
    };
  },
};

export const proExporters: readonly Exporter<HashArtifact>[] = [
  manifestExporter,
  checksumProfileExporter,
];
