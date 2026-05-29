import type { Exporter } from '@nekotools/contracts';

import {
  COOKIE_KIND_PARSED,
  COOKIE_PARSED_EXPORT_KINDS,
  type CookieArtifact,
  type CookieParsedArtifact,
  type CookieSet,
  type ParsedCookie,
} from './kinds.js';

const TOOL_ID = 'cookies';
const UTF8 = new TextEncoder();

function pickParsed(artifacts: readonly CookieArtifact[]): CookieParsedArtifact | undefined {
  return artifacts.find((a): a is CookieParsedArtifact => a.kind === COOKIE_KIND_PARSED);
}

/** Canonical single-cookie serialization with a fixed attribute order. */
function serializeCookie(c: ParsedCookie): string {
  const out = [`${c.name}=${c.value}`];
  const a = c.attributes;
  if (a.domain !== null) out.push(`Domain=${a.domain}`);
  if (a.path !== null) out.push(`Path=${a.path}`);
  if (a.expires !== null) out.push(`Expires=${a.expires}`);
  if (a.maxAge !== null) out.push(`Max-Age=${a.maxAge}`);
  if (a.sameSite !== null) out.push(`SameSite=${a.sameSite}`);
  if (a.secure) out.push('Secure');
  if (a.httpOnly) out.push('HttpOnly');
  if (a.partitioned) out.push('Partitioned');
  for (const [k, v] of Object.entries(a.extras)) out.push(v === '' ? k : `${k}=${v}`);
  return out.join('; ');
}

/**
 * `cookie.export.json` — the cookies as a JSON array of
 * `{ name, value, attributes }`. Values are included (the tool's job is
 * to inspect them); the markdown summary is the value-free view.
 */
export const jsonExporter: Exporter<CookieArtifact> = {
  version: 1,
  id: 'cookie.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: COOKIE_PARSED_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const cookies = pickParsed(artifacts)?.value.cookies ?? [];
    return { mimeType: 'application/json', extension: 'json', body: JSON.stringify(cookies, null, 2) };
  },
};

/**
 * `cookie.export.normalized` — each cookie re-serialized with a canonical
 * attribute order (one per line for Set-Cookie mode; a single `; `-joined
 * line for Cookie mode). Empty string when nothing parsed.
 */
export const normalizedExporter: Exporter<CookieArtifact> = {
  version: 1,
  id: 'cookie.export.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: COOKIE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const value: CookieSet | undefined = pickParsed(artifacts)?.value;
    if (value === undefined || value.cookies.length === 0) {
      return { mimeType: 'text/plain', extension: 'txt', body: '' };
    }
    const body =
      value.mode === 'cookie'
        ? value.cookies.map((c) => `${c.name}=${c.value}`).join('; ')
        : value.cookies.map(serializeCookie).join('\n');
    return { mimeType: 'text/plain', extension: 'txt', body };
  },
};

/**
 * `cookie.export.markdown.summary` — a value-free report: per-cookie
 * attributes + value *length* (never the secret), plus the security
 * diagnostics. Safe to paste into a ticket.
 */
export const markdownSummaryExporter: Exporter<CookieArtifact> = {
  version: 1,
  id: 'cookie.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: COOKIE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const value: CookieSet | undefined = pickParsed(artifacts)?.value;
    const lines: string[] = ['# NekoCookies export', ''];

    if (value === undefined || value.cookies.length === 0) {
      lines.push('No cookies parsed.');
    } else {
      lines.push(`- mode: \`${value.mode}\``, `- cookies: ${value.cookies.length}`, '');
      lines.push('| name | value length | Secure | HttpOnly | SameSite | Path | Domain |');
      lines.push('| --- | ---: | --- | --- | --- | --- | --- |');
      for (const c of value.cookies) {
        const a = c.attributes;
        lines.push(
          `| \`${c.name}\` | ${UTF8.encode(c.value).byteLength} | ${a.secure ? 'yes' : 'no'} | ${
            a.httpOnly ? 'yes' : 'no'
          } | ${a.sameSite ?? '—'} | ${a.path ?? '—'} | ${a.domain ?? '—'} |`,
        );
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

export const freeExporters: readonly Exporter<CookieArtifact>[] = [
  jsonExporter,
  normalizedExporter,
  markdownSummaryExporter,
];
