import type { Exporter } from '@nekotools/contracts';

import { auditJwt, type JwtAuditSeverity } from './audit.js';
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

// --- Pro exporters (registered in the binary, gated by entitlement) --------

const SARIF_LEVEL: Record<JwtAuditSeverity, string> = {
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'note',
};

/**
 * `jwt.export.claims.policy` (Pro) — a claims & security audit report:
 * alg=none, expiry/nbf, missing recommended claims, over-long lifetime,
 * symmetric-alg note. Pure + local (time checks reuse the parser's
 * clock-aware diagnostics).
 */
export const claimsPolicyExporter: Exporter<JwtArtifact> = {
  version: 1,
  id: 'jwt.export.claims.policy',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: JWT_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const doc = pickDocuments(artifacts)[0]?.value;
    const findings = auditJwt(doc, diagnostics);
    const counts = { high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) counts[f.severity] += 1;

    const lines: string[] = ['# NekoJWT claims & security audit', ''];
    lines.push(`- alg: ${doc ? JSON.stringify(doc.header.alg) : '(no token)'}`);
    lines.push(
      `- findings: ${findings.length} (high: ${counts.high}, medium: ${counts.medium}, low: ${counts.low}, info: ${counts.info})`,
      '',
    );
    if (findings.length > 0) {
      lines.push('| severity | rule | detail |', '| --- | --- | --- |');
      for (const f of findings) lines.push(`| ${f.severity} | \`${f.ruleId}\` | ${f.detail} |`);
    } else {
      lines.push('No policy issues detected.');
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

/**
 * `jwt.export.sarif` (Pro) — SARIF 2.1.0 of the audit findings so a token
 * review drops into CI code-scanning. Carries no secret material.
 */
export const sarifExporter: Exporter<JwtArtifact> = {
  version: 1,
  id: 'jwt.export.sarif',
  toolId: TOOL_ID,
  target: 'json',
  accepts: JWT_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'application/sarif+json',
  producesExtension: 'sarif',
  export({ artifacts, diagnostics }) {
    const doc = pickDocuments(artifacts)[0]?.value;
    const findings = auditJwt(doc, diagnostics);
    const ruleIds = [...new Set(findings.map((f) => f.ruleId))];
    const sarif = {
      version: '2.1.0',
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      runs: [
        {
          tool: {
            driver: {
              name: 'NekoJWT',
              informationUri: 'https://nekotools.local',
              rules: ruleIds.map((id) => ({ id })),
            },
          },
          results: findings.map((f) => ({
            ruleId: f.ruleId,
            level: SARIF_LEVEL[f.severity],
            message: { text: f.detail },
          })),
        },
      ],
    };
    return {
      mimeType: 'application/sarif+json',
      extension: 'sarif',
      body: JSON.stringify(sarif, null, 2),
    };
  },
};

export const proExporters: readonly Exporter<JwtArtifact>[] = [claimsPolicyExporter, sarifExporter];
