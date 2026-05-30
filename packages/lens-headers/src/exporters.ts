import type { Exporter } from '@nekotools/contracts';

import {
  HEADERS_DOCUMENT_EXPORT_KINDS,
  HEADERS_KIND_DOCUMENT,
  type HeaderEntry,
  type HeadersArtifact,
  type HeadersDocumentArtifact,
} from './kinds.js';

const TOOL_ID = 'headers';

function pickDocuments(artifacts: readonly HeadersArtifact[]): readonly HeadersDocumentArtifact[] {
  return artifacts.filter((a): a is HeadersDocumentArtifact => a.kind === HEADERS_KIND_DOCUMENT);
}

/**
 * Headers as a JSON object (name -> value). Repeated names collapse to an
 * array of values so the export is lossless. Names keep their original
 * case from the first occurrence.
 */
export const jsonExporter: Exporter<HeadersArtifact> = {
  version: 1,
  id: 'headers.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: HEADERS_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const out: Record<string, string | string[]> = {};
    for (const doc of pickDocuments(artifacts)) {
      for (const entry of doc.value.entries) {
        const existing = out[entry.name];
        if (existing === undefined) {
          out[entry.name] = entry.value;
        } else if (Array.isArray(existing)) {
          existing.push(entry.value);
        } else {
          out[entry.name] = [existing, entry.value];
        }
      }
    }
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(out, null, 2) };
  },
};

/** Markdown summary: header count, the headers, and any diagnostics. */
export const markdownSummaryExporter: Exporter<HeadersArtifact> = {
  version: 1,
  id: 'headers.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: HEADERS_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const docs = pickDocuments(artifacts);
    const lines: string[] = ['# NekoHeaders export', ''];
    for (const doc of docs) {
      if (doc.value.startLine !== null) lines.push(`- start line: \`${doc.value.startLine}\``);
      lines.push(`- ${doc.value.entries.length} header${doc.value.entries.length === 1 ? '' : 's'}`);
      for (const entry of doc.value.entries) {
        lines.push(`  - \`${entry.name}\`: ${entry.value}`);
      }
    }
    lines.push('');
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

export const freeExporters: readonly Exporter<HeadersArtifact>[] = [
  jsonExporter,
  markdownSummaryExporter,
];

// --- Pro security model (derived from the parsed entries) ------------------

export type HeaderAuditSeverity = 'high' | 'medium' | 'low';

export interface HeaderAuditFinding {
  readonly severity: HeaderAuditSeverity;
  readonly header: string;
  readonly detail: string;
}

const SEVERITY_RANK: Record<HeaderAuditSeverity, number> = { high: 0, medium: 1, low: 2 };

/** Recommended security headers and the severity of their absence. */
const RECOMMENDED: readonly { header: string; severity: HeaderAuditSeverity; detail: string }[] = [
  { header: 'strict-transport-security', severity: 'high', detail: 'HSTS absent — connections can be downgraded to HTTP' },
  { header: 'content-security-policy', severity: 'high', detail: 'CSP absent — no defense-in-depth against XSS / injection' },
  { header: 'x-content-type-options', severity: 'medium', detail: 'X-Content-Type-Options absent — recommended: nosniff' },
  { header: 'x-frame-options', severity: 'medium', detail: 'X-Frame-Options absent — clickjacking is not restricted' },
  { header: 'referrer-policy', severity: 'low', detail: 'Referrer-Policy absent — referrers may leak across origins' },
];

function entriesOf(artifacts: readonly HeadersArtifact[]): readonly HeaderEntry[] {
  return pickDocuments(artifacts)[0]?.value.entries ?? [];
}

/**
 * Audit the parsed headers for security posture. Pure, deterministic, derived
 * from the document's entries (case-insensitive) — independent of diagnostics.
 */
export function auditHeaders(entries: readonly HeaderEntry[]): HeaderAuditFinding[] {
  const present = new Set(entries.map((e) => e.name.toLowerCase()));
  const byName = new Map(entries.map((e) => [e.name.toLowerCase(), e.value]));
  const findings: HeaderAuditFinding[] = [];

  for (const rec of RECOMMENDED) {
    if (!present.has(rec.header)) {
      findings.push({ severity: rec.severity, header: rec.header, detail: rec.detail });
    }
  }
  // Value-level checks for headers that ARE present.
  const hsts = byName.get('strict-transport-security');
  if (hsts !== undefined) {
    const m = /max-age=(\d+)/i.exec(hsts);
    if (m === null || Number(m[1]) < 15552000) {
      findings.push({
        severity: 'medium',
        header: 'strict-transport-security',
        detail: 'HSTS max-age is short (< 180 days) — consider a longer max-age + includeSubDomains',
      });
    }
  }
  const xfoRaw = byName.get('x-frame-options');
  const xfo = xfoRaw?.toUpperCase();
  if (xfo !== undefined && xfo !== 'DENY' && xfo !== 'SAMEORIGIN') {
    findings.push({
      severity: 'low',
      header: 'x-frame-options',
      detail: `X-Frame-Options value "${xfoRaw}" is non-standard (use DENY or SAMEORIGIN)`,
    });
  }

  return findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

// --- Pro exporters (registered in the binary, gated by entitlement) --------

/**
 * `headers.export.audit.report` (Pro) — the `security.audit` capability: a
 * severity-ranked security-posture report of the response headers (the free
 * markdown summary is a flat dump; this ranks findings high→low with counts
 * and an A/B/C/F posture grade). Pure + local.
 */
export const auditReportExporter: Exporter<HeadersArtifact> = {
  version: 1,
  id: 'headers.export.audit.report',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: HEADERS_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const entries = entriesOf(artifacts);
    const findings = auditHeaders(entries);
    const counts = { high: 0, medium: 0, low: 0 };
    for (const f of findings) counts[f.severity] += 1;
    const grade = counts.high > 0 ? 'F' : counts.medium > 0 ? 'C' : counts.low > 0 ? 'B' : 'A';

    const lines: string[] = ['# NekoHeaders security audit', ''];
    lines.push(
      `- headers: ${entries.length}`,
      `- grade: ${grade}`,
      `- findings: ${findings.length} (high: ${counts.high}, medium: ${counts.medium}, low: ${counts.low})`,
      '',
    );
    if (findings.length > 0) {
      lines.push('| severity | header | finding |', '| --- | --- | --- |');
      for (const f of findings) lines.push(`| ${f.severity} | \`${f.header}\` | ${f.detail} |`);
    } else {
      lines.push('No security findings — headers look locked down.');
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

/** The hardened response-header pack the CORS/CSP exporter emits. */
const RECOMMENDED_PACK: readonly { name: string; value: string }[] = [
  { name: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { name: 'Content-Security-Policy', value: "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'" },
  { name: 'X-Content-Type-Options', value: 'nosniff' },
  { name: 'X-Frame-Options', value: 'DENY' },
  { name: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { name: 'Permissions-Policy', value: 'geolocation=(), camera=(), microphone=()' },
  { name: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { name: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { name: 'Access-Control-Allow-Origin', value: 'https://app.example.com' },
  { name: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
  { name: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
];

/**
 * `headers.export.cors-csp.pack` (Pro) — the `packs.cors-csp` capability: a
 * ready-to-paste hardened response-header pack (HSTS, CSP, X-Frame-Options,
 * X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP/CORP, and
 * a same-origin CORS baseline). Each header already present in the pasted input
 * is annotated `(already set — review value)`. Pure + local; a starter pack,
 * not a live probe.
 */
export const corsCspPackExporter: Exporter<HeadersArtifact> = {
  version: 1,
  id: 'headers.export.cors-csp.pack',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: HEADERS_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const present = new Set(entriesOf(artifacts).map((e) => e.name.toLowerCase()));
    const lines: string[] = [
      '# NekoHeaders hardened CORS + CSP pack',
      '#  paste the missing headers into your server/CDN config; tune origins to taste',
      '',
    ];
    for (const h of RECOMMENDED_PACK) {
      const already = present.has(h.name.toLowerCase()) ? '  # (already set — review value)' : '';
      lines.push(`${h.name}: ${h.value}${already}`);
    }
    return { mimeType: 'text/plain', extension: 'txt', body: lines.join('\n') };
  },
};

export const proExporters: readonly Exporter<HeadersArtifact>[] = [
  auditReportExporter,
  corsCspPackExporter,
];
