import type { PasswordReport } from './kinds.js';

/**
 * NekoPassword policy audit (Pro). Evaluates a `password.report` against an
 * organization policy and produces pass/fail findings with stable rule ids.
 * The Pro `policy.report` (markdown) and `audit.csv` exporters render these.
 *
 * Sensitive-artifact safety holds by construction: this operates only on the
 * derived `PasswordReport` (length, entropy, score, char classes, warning
 * COUNT), never on the cleartext — so no finding can carry the password.
 * Pure, local, deterministic.
 */

export type PasswordPolicySeverity = 'high' | 'medium' | 'low';

export interface PasswordPolicy {
  readonly minLength: number;
  /** Minimum 0–4 strength score. */
  readonly minScore: number;
  readonly minEntropyBits: number;
  readonly requireLower: boolean;
  readonly requireUpper: boolean;
  readonly requireDigit: boolean;
  readonly requireSymbol: boolean;
  /** Fail if the strength engine flagged any weakening pattern. */
  readonly forbidPatternWarnings: boolean;
}

/** A reasonable default corporate policy (NIST-ish, leaning strict). */
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  minScore: 3,
  minEntropyBits: 60,
  requireLower: true,
  requireUpper: true,
  requireDigit: true,
  requireSymbol: true,
  forbidPatternWarnings: true,
};

/** Stable rule ids — the contract the audit/CSV exporters and CI consume. */
export const PASSWORD_POLICY_RULE_IDS = {
  minLength: 'password.policy.min_length',
  minScore: 'password.policy.min_score',
  minEntropy: 'password.policy.min_entropy',
  requireLower: 'password.policy.require_lowercase',
  requireUpper: 'password.policy.require_uppercase',
  requireDigit: 'password.policy.require_digit',
  requireSymbol: 'password.policy.require_symbol',
  noPatterns: 'password.policy.no_weak_patterns',
} as const;

export interface PasswordPolicyFinding {
  readonly ruleId: string;
  readonly status: 'pass' | 'fail';
  readonly severity: PasswordPolicySeverity;
  /** Human detail — derived metrics only, never the password. */
  readonly detail: string;
}

export interface PasswordPolicyAudit {
  readonly compliant: boolean;
  readonly passed: number;
  readonly failed: number;
  readonly findings: readonly PasswordPolicyFinding[];
}

export function auditPassword(
  report: PasswordReport | undefined,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): PasswordPolicyAudit {
  const findings: PasswordPolicyFinding[] = [];
  const add = (ruleId: string, ok: boolean, severity: PasswordPolicySeverity, detail: string): void => {
    findings.push({ ruleId, status: ok ? 'pass' : 'fail', severity, detail });
  };

  if (report === undefined) {
    return { compliant: false, passed: 0, failed: 0, findings: [] };
  }

  add(
    PASSWORD_POLICY_RULE_IDS.minLength,
    report.length >= policy.minLength,
    'high',
    `length ${report.length} (policy requires ≥ ${policy.minLength})`,
  );
  add(
    PASSWORD_POLICY_RULE_IDS.minScore,
    report.score >= policy.minScore,
    'high',
    `strength score ${report.score}/4 (policy requires ≥ ${policy.minScore})`,
  );
  add(
    PASSWORD_POLICY_RULE_IDS.minEntropy,
    report.entropyBits >= policy.minEntropyBits,
    'high',
    `entropy ~${report.entropyBits} bits (policy requires ≥ ${policy.minEntropyBits})`,
  );
  if (policy.requireLower)
    add(PASSWORD_POLICY_RULE_IDS.requireLower, report.charClasses.lower, 'medium', 'lowercase letter required');
  if (policy.requireUpper)
    add(PASSWORD_POLICY_RULE_IDS.requireUpper, report.charClasses.upper, 'medium', 'uppercase letter required');
  if (policy.requireDigit)
    add(PASSWORD_POLICY_RULE_IDS.requireDigit, report.charClasses.digit, 'medium', 'digit required');
  if (policy.requireSymbol)
    add(PASSWORD_POLICY_RULE_IDS.requireSymbol, report.charClasses.symbol, 'medium', 'symbol required');
  if (policy.forbidPatternWarnings)
    add(
      PASSWORD_POLICY_RULE_IDS.noPatterns,
      report.warnings.length === 0,
      'high',
      report.warnings.length === 0
        ? 'no weakening patterns detected'
        : `${report.warnings.length} weakening pattern(s) detected`,
    );

  const failed = findings.filter((f) => f.status === 'fail').length;
  return { compliant: failed === 0, passed: findings.length - failed, failed, findings };
}
