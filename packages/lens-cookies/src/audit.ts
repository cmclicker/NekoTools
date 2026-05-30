import { COOKIE_DIAGNOSTIC_CODES } from './diagnostics.js';
import type { CookieSet } from './kinds.js';

/**
 * NekoCookies security & privacy posture audit. The Pro
 * `cookie.export.audit.report` and `cookie.export.sarif` exporters render
 * these findings. The free parser already surfaces the per-cookie issues as
 * diagnostics; this audit is the deeper, ruleId-keyed, security-impact-ranked
 * analysis CI consumes. It reuses the parser's diagnostic codes as ruleIds
 * for the overlapping checks (so a SARIF ruleId matches the diagnostic a user
 * already sees), elevates severities by real impact (missing Secure on a
 * session cookie is high, not a flat warning), and adds posture rules the
 * free tier does not run (broad Domain, Partitioned-without-Secure,
 * SameSite=None privacy surface). Attribute rules only apply in `set-cookie`
 * mode — a `Cookie` request header carries no attributes. Pure, local,
 * deterministic; derived purely from the parsed cookies, no clock, no network.
 */

export type CookieAuditSeverity = 'high' | 'medium' | 'low' | 'info';

export interface CookieAuditFinding {
  readonly ruleId: string;
  readonly severity: CookieAuditSeverity;
  /** The cookie the finding is about, or `null` for whole-set rules. */
  readonly target: string | null;
  readonly detail: string;
}

export const COOKIE_AUDIT_SEVERITY_RANK: Record<CookieAuditSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

/** Audit-only rule ids (the parser does not emit these as diagnostics). */
export const COOKIE_AUDIT_CODES = {
  sameSiteNone: 'cookie.samesite_none',
  broadDomain: 'cookie.broad_domain',
  partitionedInsecure: 'cookie.partitioned_insecure',
} as const;

/** Names that look like they carry a session / auth secret. */
const SESSION_NAME = /sess|sid|token|auth|login|jwt|csrf|xsrf/i;

export function auditCookies(set: CookieSet | undefined): CookieAuditFinding[] {
  const findings: CookieAuditFinding[] = [];
  if (set === undefined) return findings;

  const seen = new Set<string>();
  const add = (
    ruleId: string,
    severity: CookieAuditSeverity,
    target: string | null,
    detail: string,
  ): void => {
    const key = `${ruleId}|${target ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ ruleId, severity, target, detail });
  };

  // Attribute-based rules only make sense for Set-Cookie (response) cookies.
  if (set.mode === 'set-cookie') {
    for (const c of set.cookies) {
      const a = c.attributes;
      const sessionLike = SESSION_NAME.test(c.name);

      if (!a.secure) {
        add(
          COOKIE_DIAGNOSTIC_CODES.insecure,
          'high',
          c.name,
          `"${c.name}" has no Secure — sent over plaintext HTTP and interceptable`,
        );
      }
      if (!a.httpOnly) {
        add(
          COOKIE_DIAGNOSTIC_CODES.noHttpOnly,
          sessionLike ? 'high' : 'medium',
          c.name,
          `"${c.name}" has no HttpOnly — readable via document.cookie (XSS exfiltration)${
            sessionLike ? '; the name looks session-bearing' : ''
          }`,
        );
      }

      const ss = a.sameSite?.toLowerCase() ?? null;
      if (ss === null) {
        add(
          COOKIE_DIAGNOSTIC_CODES.sameSiteMissing,
          'low',
          c.name,
          `"${c.name}" has no SameSite — relies on the browser default (Lax)`,
        );
      } else if (ss === 'none' && !a.secure) {
        add(
          COOKIE_DIAGNOSTIC_CODES.sameSiteNoneInsecure,
          'high',
          c.name,
          `"${c.name}" is SameSite=None without Secure — rejected by browsers and CSRF-exposed`,
        );
      } else if (ss === 'none') {
        add(
          COOKIE_AUDIT_CODES.sameSiteNone,
          'low',
          c.name,
          `"${c.name}" is SameSite=None — sent on cross-site requests (CSRF / cross-site tracking surface)`,
        );
      }

      if (c.name.startsWith('__Secure-') && !a.secure) {
        add(
          COOKIE_DIAGNOSTIC_CODES.securePrefix,
          'high',
          c.name,
          `"${c.name}" uses the __Secure- prefix without Secure — the browser rejects it`,
        );
      }
      if (c.name.startsWith('__Host-') && (!a.secure || a.path !== '/' || a.domain !== null)) {
        add(
          COOKIE_DIAGNOSTIC_CODES.hostPrefix,
          'high',
          c.name,
          `"${c.name}" violates __Host- rules (needs Secure, Path=/, and no Domain)`,
        );
      }
      if (a.domain !== null && a.domain.startsWith('.')) {
        add(
          COOKIE_AUDIT_CODES.broadDomain,
          'medium',
          c.name,
          `"${c.name}" scopes Domain=${a.domain} to all subdomains — broadens exposure`,
        );
      }
      if (a.partitioned && !a.secure) {
        add(
          COOKIE_AUDIT_CODES.partitionedInsecure,
          'medium',
          c.name,
          `"${c.name}" is Partitioned without Secure — CHIPS requires Secure`,
        );
      }
    }
  }

  // Duplicate-name detection (both modes).
  const counts = new Map<string, number>();
  for (const c of set.cookies) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  for (const [name, n] of counts) {
    if (n > 1) {
      add(COOKIE_DIAGNOSTIC_CODES.duplicateName, 'low', name, `cookie name "${name}" appears ${n} times`);
    }
  }

  return findings.sort(
    (a, b) =>
      COOKIE_AUDIT_SEVERITY_RANK[a.severity] - COOKIE_AUDIT_SEVERITY_RANK[b.severity] ||
      a.ruleId.localeCompare(b.ruleId) ||
      (a.target ?? '').localeCompare(b.target ?? ''),
  );
}
