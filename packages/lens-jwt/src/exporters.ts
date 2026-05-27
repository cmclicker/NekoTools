import type { Exporter } from '@nekotools/contracts';

import {
  JWT_DOCUMENT_EXPORT_KINDS,
  JWT_KIND_DOCUMENT,
  type JwtArtifact,
  type JwtDocumentArtifact,
} from './kinds.js';

const TOOL_ID = 'jwt';

function pickDocuments(artifacts: readonly JwtArtifact[]): readonly JwtDocumentArtifact[] {
  return artifacts.filter((a): a is JwtDocumentArtifact => a.kind === JWT_KIND_DOCUMENT);
}

export const headerJsonExporter: Exporter<JwtArtifact> = {
  version: 1,
  id: 'jwt.export.header.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: JWT_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const docs = pickDocuments(artifacts);
    const doc = docs[0];
    const body = JSON.stringify(doc?.value.header ?? {}, null, 2);
    return { mimeType: 'application/json', extension: 'json', body };
  },
};

export const payloadJsonExporter: Exporter<JwtArtifact> = {
  version: 1,
  id: 'jwt.export.payload.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: JWT_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const docs = pickDocuments(artifacts);
    const doc = docs[0];
    const body = JSON.stringify(doc?.value.payload ?? {}, null, 2);
    return { mimeType: 'application/json', extension: 'json', body };
  },
};

export const claimsTableJsonExporter: Exporter<JwtArtifact> = {
  version: 1,
  id: 'jwt.export.claims.table.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: JWT_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const docs = pickDocuments(artifacts);
    const doc = docs[0];
    if (!doc) return { mimeType: 'application/json', extension: 'json', body: '[]' };
    const table = Object.entries(doc.value.payload).map(([key, value]) => ({
      claim: key,
      value,
    }));
    const body = JSON.stringify(table, null, 2);
    return { mimeType: 'application/json', extension: 'json', body };
  },
};

export const markdownSummaryExporter: Exporter<JwtArtifact> = {
  version: 1,
  id: 'jwt.export.summary.markdown',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: JWT_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const docs = pickDocuments(artifacts);
    const doc = docs[0];
    const lines: string[] = ['# NekoJWT Export', ''];

    if (!doc) {
      lines.push('No JWT document to export.');
      return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
    }

    const { header, payload } = doc.value;

    lines.push('## Header', '');
    lines.push(`- **alg**: ${JSON.stringify(header.alg)}`);
    if (header.typ) lines.push(`- **typ**: ${JSON.stringify(header.typ)}`);
    if (header.kid) lines.push(`- **kid**: ${JSON.stringify(header.kid)}`);
    lines.push('');

    lines.push('## Claims', '');
    const standardClaims = ['sub', 'iss', 'aud', 'exp', 'iat', 'nbf', 'jti'];
    for (const claim of standardClaims) {
      if (claim in payload) {
        const value = payload[claim as keyof typeof payload];
        if (typeof value === 'number' && (claim === 'exp' || claim === 'iat' || claim === 'nbf')) {
          const date = new Date(value * 1000).toISOString();
          lines.push(`- **${claim}**: ${value} (${date})`);
        } else {
          lines.push(`- **${claim}**: ${JSON.stringify(value)}`);
        }
      }
    }

    const customClaims = Object.keys(payload).filter((k) => !standardClaims.includes(k));
    if (customClaims.length > 0) {
      lines.push('');
      lines.push('## Custom Claims', '');
      for (const claim of customClaims) {
        lines.push(`- **${claim}**: ${JSON.stringify(payload[claim as keyof typeof payload])}`);
      }
    }

    if (diagnostics.length > 0) {
      lines.push('');
      lines.push('## Diagnostics', '');
      for (const d of diagnostics) {
        lines.push(`- **${d.severity.toUpperCase()}** \`${d.code}\` — ${d.message}`);
      }
    }

    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<JwtArtifact>[] = [
  headerJsonExporter,
  payloadJsonExporter,
  claimsTableJsonExporter,
  markdownSummaryExporter,
];
