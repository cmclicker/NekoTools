import type { ParsedUrl, UrlComponents, UrlQueryParam } from './kinds.js';

/**
 * NekoURL Pro code generation. Backs the declared Pro exporters
 * `url.export.batch.audit` (pro entitlement `batch.audit`) and
 * `url.export.redaction.preset` (pro entitlement `redaction.presets`).
 *
 * Both are pure, deterministic functions of already-parsed `url.parsed`
 * component data — no network, no clock, no premium-engine dependency.
 * This is the whole thesis of NekoURL's `outOfScope` list: nothing here
 * follows a redirect, resolves DNS, inspects TLS, or fetches the resource.
 * Every finding is derivable from the WHATWG-`URL` breakdown the parser
 * already produced; an invalid / unparsed url contributes nothing.
 */

// --- Tracking-parameter catalogue ------------------------------------------
//
// A small, well-known set of analytics/click-tracking parameters. Matching
// is purely lexical against the already-parsed query keys — there is no
// lookup, no list refresh, nothing fetched. `utm_*` is matched by prefix;
// the rest are matched exactly (case-insensitive).

const TRACKING_PREFIXES: readonly string[] = ['utm_'];

const TRACKING_EXACT: readonly string[] = [
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'mc_eid',
  'mc_cid',
  'igshid',
  'twclid',
  'yclid',
  'wickedid',
  '_hsenc',
  '_hsmi',
  'vero_id',
  'oly_anon_id',
  'oly_enc_id',
];

/** A query key is "tracking-ish" if it prefix- or exact-matches the catalogue. */
export function isTrackingKey(key: string): boolean {
  const k = key.toLowerCase();
  if (TRACKING_PREFIXES.some((p) => k.startsWith(p))) return true;
  return TRACKING_EXACT.includes(k);
}

/** Distinct tracking keys present in the parsed query, in first-appearance order. */
function trackingKeysOf(params: readonly UrlQueryParam[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { key } of params) {
    if (isTrackingKey(key) && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

// --- Security / hygiene audit (markdown) -----------------------------------

/** Soft threshold above which a query is flagged as carrying excessive params. */
export const EXCESSIVE_QUERY_PARAMS = 10;

/**
 * Cleartext network schemes with a secure sibling. Kept local to codegen so
 * the audit stays a pure function of components (mirrors the parser's
 * `INSECURE_SCHEME_UPGRADES`, but the audit must not import diagnostics).
 */
const INSECURE_SCHEMES: Readonly<Record<string, string>> = {
  http: 'https',
  ws: 'wss',
  ftp: 'ftps',
};

export type AuditSeverity = 'high' | 'medium' | 'low';

export interface AuditFinding {
  readonly severity: AuditSeverity;
  readonly code: string;
  readonly detail: string;
}

const SEVERITY_RANK: Readonly<Record<AuditSeverity, number>> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Collect the security/hygiene findings for one parsed URL. Every finding is
 * derivable WITHOUT the network, purely from the parsed components:
 *
 *   - high   `audit.credentials_in_url`  — userinfo embedded (hasUsername/hasPassword)
 *   - medium `audit.insecure_scheme`     — cleartext transport scheme (http/ws/ftp)
 *   - low    `audit.non_standard_port`   — an explicit (non-default) port
 *   - medium `audit.tracking_params`     — known analytics/click-tracking keys
 *   - low    `audit.excessive_params`    — more query params than the soft threshold
 *   - low    `audit.fragment_payload`    — a fragment that carries data
 *
 * An invalid url (no components) yields no findings.
 */
export function auditUrl(value: ParsedUrl): readonly AuditFinding[] {
  if (!value.valid || value.components === null) return [];
  const c = value.components;
  const findings: AuditFinding[] = [];

  if (c.hasUsername || c.hasPassword) {
    findings.push({
      severity: 'high',
      code: 'audit.credentials_in_url',
      detail:
        'Credentials are embedded in the URL userinfo; they leak into logs, history, and Referer headers.',
    });
  }

  const upgrade = INSECURE_SCHEMES[c.scheme];
  if (upgrade !== undefined) {
    findings.push({
      severity: 'medium',
      code: 'audit.insecure_scheme',
      detail: `Scheme "${c.scheme}" transmits data in cleartext; prefer "${upgrade}".`,
    });
  }

  if (c.port !== '') {
    findings.push({
      severity: 'low',
      code: 'audit.non_standard_port',
      detail: `An explicit non-default port (${c.port}) is set.`,
    });
  }

  const tracking = trackingKeysOf(c.queryParams);
  if (tracking.length > 0) {
    findings.push({
      severity: 'medium',
      code: 'audit.tracking_params',
      detail: `Query carries ${tracking.length} tracking parameter(s): ${tracking
        .map((k) => `\`${k}\``)
        .join(', ')}.`,
    });
  }

  if (c.queryParams.length > EXCESSIVE_QUERY_PARAMS) {
    findings.push({
      severity: 'low',
      code: 'audit.excessive_params',
      detail: `Query has ${c.queryParams.length} parameters (soft threshold ${EXCESSIVE_QUERY_PARAMS}).`,
    });
  }

  // A fragment that carries data (anything beyond the bare "#").
  if (c.hash !== '' && c.hash !== '#') {
    findings.push({
      severity: 'low',
      code: 'audit.fragment_payload',
      detail: 'The fragment carries data; fragments are not sent to the server but persist in history.',
    });
  }

  return sortFindings(findings);
}

/** Severity-ranked, then code-stable for determinism. */
function sortFindings(findings: readonly AuditFinding[]): readonly AuditFinding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return bySeverity !== 0 ? bySeverity : a.code.localeCompare(b.code);
  });
}

/** A short, credential-free label for a parsed url, used as a table row header. */
function urlLabel(value: ParsedUrl): string {
  if (value.sanitizedHref !== null) return value.sanitizedHref;
  return '(invalid URL)';
}

/**
 * Render a security/hygiene audit of one-or-more parsed URLs as markdown. A
 * severity-ranked table per URL; URLs that parsed cleanly with no findings
 * are reported as "no findings". Pure function of the parsed components.
 */
export function auditMarkdown(values: readonly ParsedUrl[]): string {
  const lines: string[] = ['# NekoURL audit', ''];

  if (values.length === 0) {
    lines.push('No URLs to audit.');
    return lines.join('\n');
  }

  lines.push(`Audited ${values.length} URL(s). All findings are derived offline from the parsed components — no redirects are followed and nothing is fetched.`);

  values.forEach((value, index) => {
    lines.push('', `## ${index + 1}. \`${urlLabel(value)}\``, '');

    if (!value.valid || value.components === null) {
      lines.push('- valid: no (not audited)');
      return;
    }

    const findings = auditUrl(value);
    if (findings.length === 0) {
      lines.push('No findings.');
      return;
    }

    lines.push('| Severity | Finding | Detail |', '| --- | --- | --- |');
    for (const f of findings) {
      lines.push(`| ${f.severity.toUpperCase()} | \`${f.code}\` | ${f.detail} |`);
    }
  });

  return lines.join('\n');
}

// --- Redaction preset (JSON) -----------------------------------------------

/**
 * A declarative redaction preset: a spec OTHERS apply, describing which parts
 * of the URL to strip/redact. It is derived from what the parsed URL actually
 * contains (no speculative rules), and it carries the already-computed
 * credential-free `sanitizedHref` as a worked example. Pure + deterministic.
 */
export interface RedactionPreset {
  readonly version: 1;
  readonly tool: 'url';
  readonly kind: 'redaction-preset';
  /** Whether the source URL parsed; an invalid URL yields an empty preset. */
  readonly valid: boolean;
  /** The redaction operations to apply, derived from the URL's contents. */
  readonly redact: {
    /** Strip the `user:pass@` userinfo (present only when credentials exist). */
    readonly userinfo: boolean;
    /** Drop the fragment (present only when the URL carries one). */
    readonly fragment: boolean;
    /** Tracking query keys to remove (only those actually present). */
    readonly stripQueryParams: readonly string[];
  };
  /** The already-computed sanitized URL (userinfo stripped), or null. */
  readonly sanitizedHref: string | null;
}

/**
 * Build a redaction preset for a single parsed URL. Each operation is keyed
 * off real parsed state: `userinfo` only when credentials are present, the
 * tracking-param list only with the keys that actually appear, `fragment`
 * only when a data-bearing fragment exists. Never invents redactions.
 */
export function redactionPreset(value: ParsedUrl): RedactionPreset {
  if (!value.valid || value.components === null) {
    return {
      version: 1,
      tool: 'url',
      kind: 'redaction-preset',
      valid: false,
      redact: { userinfo: false, fragment: false, stripQueryParams: [] },
      sanitizedHref: value.sanitizedHref,
    };
  }

  const c: UrlComponents = value.components;
  return {
    version: 1,
    tool: 'url',
    kind: 'redaction-preset',
    valid: true,
    redact: {
      userinfo: c.hasUsername || c.hasPassword,
      fragment: c.hash !== '' && c.hash !== '#',
      stripQueryParams: trackingKeysOf(c.queryParams),
    },
    sanitizedHref: value.sanitizedHref,
  };
}
