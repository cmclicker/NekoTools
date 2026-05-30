import type { HeadersDocument } from './kinds.js';

/**
 * NekoHeaders security-posture audit (Pro). The free build emits basic
 * "this header is absent" hints; the Pro audit is the deeper analysis that
 * the `audit.report` (markdown) and `sarif` exporters render: missing
 * hardening headers, weak/insecure values, permissive CORS, and
 * information-leak headers — each as a stable rule id so it drops into CI
 * code-scanning. Pure, local, deterministic.
 */

export type HeaderAuditSeverity = 'high' | 'medium' | 'low';

export interface HeaderAuditFinding {
  readonly ruleId: string;
  readonly severity: HeaderAuditSeverity;
  readonly detail: string;
}

export const HEADER_AUDIT_SEVERITY_RANK: Record<HeaderAuditSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Recommended HSTS minimum max-age: 180 days. */
const HSTS_MIN_AGE = 15552000;

export function auditHeaders(doc: HeadersDocument | undefined): HeaderAuditFinding[] {
  const findings: HeaderAuditFinding[] = [];
  if (doc === undefined) return findings;

  // Case-insensitive lookup of the first value per header name.
  const map = new Map<string, string>();
  for (const e of doc.entries) {
    const key = e.name.toLowerCase();
    if (!map.has(key)) map.set(key, e.value);
  }
  const has = (n: string): boolean => map.has(n);
  const get = (n: string): string | undefined => map.get(n);
  const add = (ruleId: string, severity: HeaderAuditSeverity, detail: string): void => {
    findings.push({ ruleId, severity, detail });
  };

  // --- Missing hardening headers --------------------------------------
  if (!has('strict-transport-security'))
    add('headers.audit.missing_hsts', 'high', 'Strict-Transport-Security (HSTS) is absent');
  if (!has('content-security-policy'))
    add('headers.audit.missing_csp', 'high', 'Content-Security-Policy is absent');
  if (!has('x-content-type-options'))
    add(
      'headers.audit.missing_x_content_type_options',
      'medium',
      'X-Content-Type-Options is absent (recommended: nosniff)',
    );
  if (!has('x-frame-options') && !(get('content-security-policy')?.toLowerCase().includes('frame-ancestors')))
    add(
      'headers.audit.missing_x_frame_options',
      'medium',
      'X-Frame-Options is absent and CSP declares no frame-ancestors',
    );
  if (!has('referrer-policy'))
    add('headers.audit.missing_referrer_policy', 'low', 'Referrer-Policy is absent');
  if (!has('permissions-policy'))
    add('headers.audit.missing_permissions_policy', 'low', 'Permissions-Policy is absent');

  // --- Weak / insecure values -----------------------------------------
  const hsts = get('strict-transport-security');
  if (hsts !== undefined) {
    const m = /max-age\s*=\s*(\d+)/i.exec(hsts);
    const age = m ? Number(m[1]) : 0;
    if (age < HSTS_MIN_AGE)
      add(
        'headers.audit.weak_hsts',
        'medium',
        `HSTS max-age ${age} is below the recommended ${HSTS_MIN_AGE} (180 days)`,
      );
  }
  const xcto = get('x-content-type-options');
  if (xcto !== undefined && xcto.trim().toLowerCase() !== 'nosniff')
    add(
      'headers.audit.weak_x_content_type_options',
      'medium',
      `X-Content-Type-Options is "${xcto}" (expected: nosniff)`,
    );
  const csp = get('content-security-policy');
  if (csp !== undefined && /'unsafe-inline'|'unsafe-eval'/i.test(csp))
    add(
      'headers.audit.csp_unsafe_directive',
      'medium',
      "Content-Security-Policy allows 'unsafe-inline' or 'unsafe-eval'",
    );
  const aco = get('access-control-allow-origin');
  if (aco !== undefined && aco.trim() === '*')
    add('headers.audit.cors_wildcard', 'medium', 'Access-Control-Allow-Origin is "*" (any origin)');

  // --- Information-leak headers (present = finding) -------------------
  const server = get('server');
  if (server !== undefined && server.trim() !== '')
    add('headers.audit.info_leak_server', 'low', `Server header reveals "${server}"`);
  if (has('x-powered-by'))
    add('headers.audit.info_leak_powered_by', 'low', `X-Powered-By reveals "${get('x-powered-by')}"`);

  return findings.sort(
    (a, b) =>
      HEADER_AUDIT_SEVERITY_RANK[a.severity] - HEADER_AUDIT_SEVERITY_RANK[b.severity] ||
      a.ruleId.localeCompare(b.ruleId),
  );
}
