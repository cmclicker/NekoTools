import type { Exporter } from '@nekotools/contracts';

import { auditCookies } from './audit.js';
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

// --- Pro exporters (registered in the binary, gated by entitlement) --------

/**
 * `cookie.export.audit.report` (Pro) — a security & privacy posture report:
 * every ruleId-keyed finding (missing Secure/HttpOnly, SameSite issues,
 * __Host-/__Secure- prefix violations, broad Domain, Partitioned-without-Secure,
 * duplicates) with its severity and cookie. Value-free — never prints a secret.
 */
export const auditReportExporter: Exporter<CookieArtifact> = {
  version: 1,
  id: 'cookie.export.audit.report',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: COOKIE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const set = pickParsed(artifacts)?.value;
    const findings = auditCookies(set);
    const counts = { high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) counts[f.severity] += 1;

    const lines: string[] = ['# NekoCookies security audit', ''];
    lines.push(
      `- mode: \`${set?.mode ?? 'set-cookie'}\``,
      `- cookies: ${set?.cookies.length ?? 0}`,
      `- findings: ${findings.length} (high: ${counts.high}, medium: ${counts.medium}, low: ${counts.low}, info: ${counts.info})`,
      '',
    );
    if (findings.length > 0) {
      lines.push('| severity | rule | cookie | detail |', '| --- | --- | --- | --- |');
      for (const f of findings) {
        lines.push(`| ${f.severity} | \`${f.ruleId}\` | ${f.target ? `\`${f.target}\`` : '—'} | ${f.detail} |`);
      }
    } else {
      lines.push('No security or privacy findings detected.');
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

/** The hardened attribute set every preset cookie carries (canonical order). */
function hardenedAttributes(name: string): string[] {
  // __Host- is the strongest binding: requires Secure + Path=/ and NO Domain.
  const isHost = name.startsWith('__Host-');
  const out: string[] = [];
  if (!isHost) out.push('Domain=example.com');
  out.push('Path=/', 'Secure', 'HttpOnly', 'SameSite=Lax');
  return out;
}

/**
 * `cookie.export.policy.preset` (Pro) — the `policy.packs` capability: a
 * ready-to-adopt hardened Set-Cookie template generated from the parsed
 * cookies. Each cookie is re-emitted with a safe attribute set (Secure,
 * HttpOnly, SameSite=Lax, Path=/; __Host- cookies keep the strict no-Domain
 * binding) so a team can standardize on it. Values are replaced with a
 * `<value>` placeholder — the preset is a policy, not the secret. A leading
 * comment block explains the applied policy. Pure + local.
 */
export const policyPresetExporter: Exporter<CookieArtifact> = {
  version: 1,
  id: 'cookie.export.policy.preset',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: COOKIE_PARSED_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const value = pickParsed(artifacts)?.value;
    const cookies = value?.cookies ?? [];
    const lines: string[] = [
      '# NekoCookies hardened policy preset',
      '#  applied: Secure + HttpOnly + SameSite=Lax + Path=/ (Domain dropped for __Host-)',
      '#  values shown as <value> — this is a policy template, not your secrets',
      '',
    ];
    if (cookies.length === 0) {
      lines.push('# (no cookies parsed)');
    } else {
      for (const c of cookies) {
        lines.push(`Set-Cookie: ${c.name}=<value>; ${hardenedAttributes(c.name).join('; ')}`);
      }
    }
    return { mimeType: 'text/plain', extension: 'txt', body: lines.join('\n') };
  },
};

export const proExporters: readonly Exporter<CookieArtifact>[] = [
  auditReportExporter,
  policyPresetExporter,
];
