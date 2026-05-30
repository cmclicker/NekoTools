import { LICENSE_DIAGNOSTIC_CODES } from './diagnostics.js';
import type { LicenseReport } from './kinds.js';

/**
 * NekoLicense obligations & risk audit. The Pro `license.export.audit.report`
 * and `license.export.sarif` exporters render these findings — a
 * compliance-forward read of the detected license: copyleft / network-copyleft
 * risk, source-disclosure and same-license obligations, state-change duties,
 * plus detection-quality signals (unidentified, SPDX-tag mismatch). It reuses
 * the parser's diagnostic codes (`license.unknown`, `license.tag_mismatch`) as
 * ruleIds for the overlapping checks. Pure, local, deterministic, heuristic +
 * informational (not legal advice).
 */

export type LicenseAuditSeverity = 'high' | 'medium' | 'low' | 'info';

export interface LicenseAuditFinding {
  readonly ruleId: string;
  readonly severity: LicenseAuditSeverity;
  readonly detail: string;
}

export const LICENSE_AUDIT_SEVERITY_RANK: Record<LicenseAuditSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

/** Audit-only rule ids (the parser does not emit these as diagnostics). */
export const LICENSE_AUDIT_CODES = {
  copyleft: 'license.copyleft',
  weakCopyleft: 'license.weak_copyleft',
  networkCopyleft: 'license.network_copyleft',
  discloseSource: 'license.disclose_source',
  sameLicense: 'license.same_license',
  stateChanges: 'license.state_changes',
} as const;

export function auditLicense(report: LicenseReport | undefined): LicenseAuditFinding[] {
  const findings: LicenseAuditFinding[] = [];
  if (report === undefined) return findings;

  const seen = new Set<string>();
  const add = (ruleId: string, severity: LicenseAuditSeverity, detail: string): void => {
    if (seen.has(ruleId)) return;
    seen.add(ruleId);
    findings.push({ ruleId, severity, detail });
  };

  // Detection quality: nothing identified.
  if (report.primary === null) {
    add(
      LICENSE_DIAGNOSTIC_CODES.unknown,
      'medium',
      report.spdxTag !== null
        ? `license text was not recognized; only an SPDX tag "${report.spdxTag}" was present — identify and classify it manually`
        : 'license text was not recognized — identify and classify it manually',
    );
    return findings;
  }

  // Detection quality: a declared SPDX tag disagrees with the text (parser's condition).
  if (
    report.spdxTag !== null &&
    report.matches.length > 0 &&
    !report.matches.includes(report.spdxTag)
  ) {
    add(
      LICENSE_DIAGNOSTIC_CODES.tagMismatch,
      'medium',
      `declared SPDX tag "${report.spdxTag}" does not match the detected license text (${report.matches.join(', ')})`,
    );
  }

  const meta = report.meta;
  if (meta !== null) {
    if (meta.category === 'copyleft') {
      add(
        LICENSE_AUDIT_CODES.copyleft,
        'high',
        `${meta.spdxId} is a strong copyleft license — distributing a derivative work generally requires releasing its source under ${meta.spdxId}`,
      );
    } else if (meta.category === 'weak-copyleft') {
      add(
        LICENSE_AUDIT_CODES.weakCopyleft,
        'medium',
        `${meta.spdxId} is weak copyleft — modifications to the licensed files must remain under ${meta.spdxId}`,
      );
    }
    const conditions = new Set(meta.conditions);
    if (conditions.has('network use is distribution')) {
      add(
        LICENSE_AUDIT_CODES.networkCopyleft,
        'high',
        `${meta.spdxId} treats network use as distribution — offering the software as a service triggers source-disclosure obligations`,
      );
    }
    if (conditions.has('disclose source')) {
      add(
        LICENSE_AUDIT_CODES.discloseSource,
        'medium',
        `${meta.spdxId} requires disclosing source for distributed works`,
      );
    }
    if (conditions.has('same license')) {
      add(
        LICENSE_AUDIT_CODES.sameLicense,
        'medium',
        `${meta.spdxId} requires derivative works to carry the same license`,
      );
    }
    if (conditions.has('state changes')) {
      add(
        LICENSE_AUDIT_CODES.stateChanges,
        'low',
        `${meta.spdxId} requires documenting changes made to the licensed material`,
      );
    }
  }

  return findings.sort(
    (a, b) =>
      LICENSE_AUDIT_SEVERITY_RANK[a.severity] - LICENSE_AUDIT_SEVERITY_RANK[b.severity] ||
      a.ruleId.localeCompare(b.ruleId),
  );
}
