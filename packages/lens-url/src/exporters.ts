import type { Exporter } from '@nekotools/contracts';

import {
  URL_KIND_PARSED,
  URL_PARSED_EXPORT_KINDS,
  type ParsedUrl,
  type UrlArtifact,
  type UrlParsedArtifact,
} from './kinds.js';

const TOOL_ID = 'url';

function pickParsed(artifacts: readonly UrlArtifact[]): UrlParsedArtifact | undefined {
  return artifacts.find((a): a is UrlParsedArtifact => a.kind === URL_KIND_PARSED);
}

/** Normalized, credential-free URL with query parameters sorted by key. */
function normalizedUrlOf(value: ParsedUrl): string {
  if (!value.valid || value.sanitizedHref === null) return '';
  const u = new URL(value.sanitizedHref);
  u.searchParams.sort();
  return u.href;
}

/**
 * `url.export.params.json` — the ordered query parameters as a JSON array
 * of `{ key, value }` pairs. An array (not an object) so repeated keys
 * survive losslessly. Empty array when the URL was invalid or had no query.
 */
export const paramsJsonExporter: Exporter<UrlArtifact> = {
  version: 1,
  id: 'url.export.params.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: URL_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const params = pickParsed(artifacts)?.value.components?.queryParams ?? [];
    return {
      mimeType: 'application/json',
      extension: 'json',
      body: JSON.stringify(params, null, 2),
    };
  },
};

/**
 * `url.export.normalized` — the normalized URL string: lowercased
 * scheme/host and default-port removal (from the platform `URL`
 * serializer), embedded credentials stripped, and query parameters
 * sorted by key. Empty string when the URL was invalid.
 */
export const normalizedExporter: Exporter<UrlArtifact> = {
  version: 1,
  id: 'url.export.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: URL_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const parsed = pickParsed(artifacts);
    const body = parsed ? normalizedUrlOf(parsed.value) : '';
    return { mimeType: 'text/plain', extension: 'txt', body };
  },
};

/**
 * `url.export.markdown.summary` — a human-readable breakdown of the URL
 * components, query parameters, and diagnostics. Credentials are reported
 * by presence only; the raw secret is never written out.
 */
export const markdownSummaryExporter: Exporter<UrlArtifact> = {
  version: 1,
  id: 'url.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: URL_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const parsed = pickParsed(artifacts);
    const lines: string[] = ['# NekoURL export', ''];

    const value = parsed?.value;
    if (value === undefined || !value.valid || value.components === null) {
      lines.push('## URL', '', '- valid: no');
    } else {
      const c = value.components;
      lines.push(
        '## URL',
        '',
        '- valid: yes',
        `- scheme: \`${c.scheme}\``,
        `- host: \`${c.host}\``,
        `- hostname: \`${c.hostname}\``,
        `- port: ${c.port === '' ? '(default)' : `\`${c.port}\``}`,
        `- pathname: \`${c.pathname}\``,
        `- credentials present: ${c.hasUsername || c.hasPassword ? 'yes' : 'no'}`,
        `- query params: ${c.queryParams.length}`,
        `- normalized: \`${normalizedUrlOf(value)}\``,
      );
      if (c.queryParams.length > 0) {
        lines.push('', '## Query parameters', '');
        for (const p of c.queryParams) lines.push(`- \`${p.key}\` = \`${p.value}\``);
      }
    }

    if (diagnostics.length > 0) {
      lines.push('', '## Diagnostics', '');
      for (const d of diagnostics) {
        lines.push(`- **${d.severity.toUpperCase()}** \`${d.code}\` — ${d.message}`);
      }
    }

    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

export const freeExporters: readonly Exporter<UrlArtifact>[] = [
  paramsJsonExporter,
  normalizedExporter,
  markdownSummaryExporter,
];
