import { PACKAGE_DIAGNOSTIC_CODES } from './diagnostics.js';
import type { PackageManifestDocument } from './kinds.js';

/**
 * NekoPackage dependency & license-risk audit. The Pro
 * `package.export.policy.report` and `package.export.ci.guard` exporters render
 * these findings. The parser already extracts the raw signals (license,
 * per-dependency remote/unpinned flags, script risk flags, duplicates); this
 * audit elevates them into a unified, ruleId-keyed, severity-ranked posture
 * and adds **license-risk classification** the free tier does not do. It
 * reuses the parser's diagnostic codes as ruleIds for the overlapping checks
 * (so a CI-guard violation id matches the diagnostic a user already sees).
 * Pure, local, deterministic — derived purely from the parsed document; no
 * network.
 */

export type PackageAuditSeverity = 'high' | 'medium' | 'low' | 'info';

export interface PackageAuditFinding {
  readonly ruleId: string;
  readonly severity: PackageAuditSeverity;
  /** The script/dependency the finding is about, or `null` for whole-manifest rules. */
  readonly target: string | null;
  readonly detail: string;
}

export const PACKAGE_AUDIT_SEVERITY_RANK: Record<PackageAuditSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

/** Audit-only rule ids (the parser does not emit these as diagnostics). */
export const PACKAGE_AUDIT_CODES = {
  licenseCopyleft: 'package.license_copyleft',
  licenseMissing: 'package.license_missing',
  licenseUnlicensed: 'package.license_unlicensed',
  licenseUnknown: 'package.license_unknown',
} as const;

const PERMISSIVE_LICENSE =
  /\b(?:MIT|MIT-0|ISC|APACHE-2\.0|BSD-2-CLAUSE|BSD-3-CLAUSE|0BSD|UNLICENSE|CC0-1\.0|BLUEOAK-1\.0\.0|ZLIB|WTFPL|PYTHON-2\.0|POSTGRESQL)\b/;

interface LicenseFinding {
  readonly ruleId: string;
  readonly severity: PackageAuditSeverity;
  readonly detail: string;
}

/** Classify a declared license string. Returns null for a clean permissive license. */
function classifyLicense(license: string): LicenseFinding | null {
  const lic = license.trim();
  const u = lic.toUpperCase();
  if (/\b(?:AGPL|SSPL)/.test(u)) {
    return {
      ruleId: PACKAGE_AUDIT_CODES.licenseCopyleft,
      severity: 'high',
      detail: `license "${lic}" is network/strong copyleft — review SaaS & distribution obligations`,
    };
  }
  if (/\bLGPL/.test(u)) {
    return {
      ruleId: PACKAGE_AUDIT_CODES.licenseCopyleft,
      severity: 'low',
      detail: `license "${lic}" is weak copyleft (LGPL)`,
    };
  }
  if (/\bGPL/.test(u)) {
    return {
      ruleId: PACKAGE_AUDIT_CODES.licenseCopyleft,
      severity: 'medium',
      detail: `license "${lic}" is copyleft (GPL) — review distribution obligations`,
    };
  }
  if (/\b(?:MPL|EPL|CDDL|EUPL|MS-RL)\b/.test(u)) {
    return {
      ruleId: PACKAGE_AUDIT_CODES.licenseCopyleft,
      severity: 'low',
      detail: `license "${lic}" is weak copyleft`,
    };
  }
  if (u === 'UNLICENSED') {
    return {
      ruleId: PACKAGE_AUDIT_CODES.licenseUnlicensed,
      severity: 'info',
      detail: 'license is UNLICENSED (intentionally unpublishable) — confirm this is deliberate',
    };
  }
  if (/SEE LICENSE/.test(u)) {
    return {
      ruleId: PACKAGE_AUDIT_CODES.licenseUnknown,
      severity: 'low',
      detail: `license references an external file ("${lic}") — not machine-verifiable`,
    };
  }
  if (PERMISSIVE_LICENSE.test(u)) return null;
  return {
    ruleId: PACKAGE_AUDIT_CODES.licenseUnknown,
    severity: 'low',
    detail: `unrecognized license identifier "${lic}" — review for compliance`,
  };
}

export function auditPackage(doc: PackageManifestDocument | undefined): PackageAuditFinding[] {
  const findings: PackageAuditFinding[] = [];
  if (doc === undefined) return findings;

  const seen = new Set<string>();
  const add = (
    ruleId: string,
    severity: PackageAuditSeverity,
    target: string | null,
    detail: string,
  ): void => {
    const key = `${ruleId}|${target ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ ruleId, severity, target, detail });
  };

  // License risk.
  if (doc.license === null) {
    if (doc.private !== true) {
      add(
        PACKAGE_AUDIT_CODES.licenseMissing,
        'medium',
        null,
        'no license field on a public package — legal ambiguity for consumers',
      );
    }
  } else {
    const finding = classifyLicense(doc.license);
    if (finding !== null) add(finding.ruleId, finding.severity, null, finding.detail);
  }

  // Script-execution risk (reuses the parser's risk flags).
  for (const script of doc.scripts) {
    if (script.riskFlags.includes('network-shell')) {
      add(
        PACKAGE_DIAGNOSTIC_CODES.networkShellScript,
        'high',
        script.name,
        `script "${script.name}" pipes downloaded content into a shell (RCE / supply-chain risk)`,
      );
    }
    if (script.riskFlags.includes('lifecycle')) {
      add(
        PACKAGE_DIAGNOSTIC_CODES.lifecycleScript,
        'medium',
        script.name,
        `script "${script.name}" runs automatically as an npm lifecycle hook`,
      );
    }
    if (script.riskFlags.includes('destructive')) {
      add(
        PACKAGE_DIAGNOSTIC_CODES.destructiveScript,
        'medium',
        script.name,
        `script "${script.name}" contains a destructive file-removal command`,
      );
    }
  }

  // Dependency supply-chain risk (reuses the parser's per-dependency flags).
  for (const dep of doc.dependencies) {
    if (dep.remote) {
      add(
        PACKAGE_DIAGNOSTIC_CODES.remoteDependency,
        'medium',
        dep.name,
        `dependency "${dep.name}" uses a remote specifier (${dep.range}) — bypasses registry integrity`,
      );
    }
    if (dep.unpinned) {
      add(
        PACKAGE_DIAGNOSTIC_CODES.unpinnedDependency,
        'low',
        dep.name,
        `dependency "${dep.name}" is unpinned (${dep.range}) — non-reproducible installs`,
      );
    }
  }
  for (const dup of doc.duplicateDependencies) {
    add(
      PACKAGE_DIAGNOSTIC_CODES.duplicateDependency,
      'low',
      dup.name,
      `dependency "${dup.name}" appears in ${dup.sections.join(', ')}`,
    );
  }

  return findings.sort(
    (a, b) =>
      PACKAGE_AUDIT_SEVERITY_RANK[a.severity] - PACKAGE_AUDIT_SEVERITY_RANK[b.severity] ||
      a.ruleId.localeCompare(b.ruleId) ||
      (a.target ?? '').localeCompare(b.target ?? ''),
  );
}
