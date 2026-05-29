import type { Diagnostic } from '@nekotools/contracts';

import type { JwtDocument } from './kinds.js';

/**
 * NekoJWT claims & security audit. The Pro `claims.policy` and `sarif`
 * exporters render these findings. Time-sensitive checks (expired,
 * not-yet-valid) come from the parser's diagnostics (it holds the clock);
 * the clock-free structural checks (symmetric alg, missing recommended
 * claims, over-long lifetime) are derived here from the decoded document.
 * Pure, local, deterministic.
 */

export type JwtAuditSeverity = 'high' | 'medium' | 'low' | 'info';

export interface JwtAuditFinding {
  readonly ruleId: string;
  readonly severity: JwtAuditSeverity;
  readonly detail: string;
}

export const JWT_AUDIT_SEVERITY_RANK: Record<JwtAuditSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

/** Parser diagnostic codes that map straight into audit findings. */
const FROM_DIAGNOSTIC: Record<string, JwtAuditSeverity> = {
  'jwt.alg_none': 'high',
  'jwt.token_expired': 'high',
  'jwt.token_not_yet_valid': 'medium',
  'jwt.missing_expiration': 'medium',
};

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

export function auditJwt(
  doc: JwtDocument | undefined,
  diagnostics: readonly Diagnostic[],
): JwtAuditFinding[] {
  const findings: JwtAuditFinding[] = [];
  const seen = new Set<string>();
  const add = (ruleId: string, severity: JwtAuditSeverity, detail: string): void => {
    if (seen.has(ruleId)) return;
    seen.add(ruleId);
    findings.push({ ruleId, severity, detail });
  };

  // Time-sensitive findings: the parser already evaluated them with its clock.
  for (const d of diagnostics) {
    const severity = FROM_DIAGNOSTIC[d.code];
    if (severity !== undefined) add(d.code, severity, d.message);
  }

  if (doc !== undefined) {
    const { header, payload } = doc;
    if (typeof header.alg === 'string' && /^HS\d+$/.test(header.alg)) {
      add(
        'jwt.symmetric_alg',
        'info',
        `alg ${header.alg} is symmetric (HMAC) — verifying needs the shared secret, which must never be published`,
      );
    }
    if (payload.exp === undefined) add('jwt.missing_expiration', 'medium', 'no exp (expiration) claim');
    if (payload.iat === undefined) add('jwt.missing_iat', 'low', 'no iat (issued-at) claim');
    if (payload.iss === undefined) add('jwt.missing_iss', 'low', 'no iss (issuer) claim');
    if (payload.aud === undefined) add('jwt.missing_aud', 'low', 'no aud (audience) claim');
    if (payload.sub === undefined) add('jwt.missing_sub', 'low', 'no sub (subject) claim');
    if (
      typeof payload.exp === 'number' &&
      typeof payload.iat === 'number' &&
      payload.exp - payload.iat > THIRTY_DAYS_SECONDS
    ) {
      const days = Math.round((payload.exp - payload.iat) / 86400);
      add('jwt.long_lived', 'low', `token lifetime is ${days} days (> 30) — consider shorter-lived tokens`);
    }
  }

  return findings.sort(
    (a, b) =>
      JWT_AUDIT_SEVERITY_RANK[a.severity] - JWT_AUDIT_SEVERITY_RANK[b.severity] ||
      a.ruleId.localeCompare(b.ruleId),
  );
}
