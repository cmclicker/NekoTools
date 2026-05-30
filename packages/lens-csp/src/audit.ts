import { CSP_DIAGNOSTIC_CODES } from './diagnostics.js';
import type { CspReport } from './kinds.js';

/**
 * NekoCSP posture audit. The Pro `csp.export.report` and `csp.export.sarif`
 * exporters render these findings. The free parser already surfaces the
 * basic issues as diagnostics; this audit is the deeper, ruleId-keyed
 * analysis that CI consumes — it reuses the parser's diagnostic codes for
 * the overlapping checks (so a SARIF ruleId matches the diagnostic a user
 * already sees) and adds posture rules the free tier does not run
 * (insecure schemes, scheme-only sources, missing base-uri / form-action,
 * absent violation reporting). Pure, local, deterministic; derived purely
 * from the parsed directives — no clock, no network.
 */

export type CspAuditSeverity = 'high' | 'medium' | 'low' | 'info';

export interface CspAuditFinding {
  readonly ruleId: string;
  readonly severity: CspAuditSeverity;
  /** The directive the finding is about, or `null` for whole-policy rules. */
  readonly directive: string | null;
  readonly detail: string;
}

export const CSP_AUDIT_SEVERITY_RANK: Record<CspAuditSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

/**
 * Audit-only rule ids (the parser does not emit these as diagnostics).
 * Overlapping checks reuse `CSP_DIAGNOSTIC_CODES`.
 */
export const CSP_AUDIT_CODES = {
  insecureScheme: 'csp.insecure_scheme',
  broadScheme: 'csp.broad_scheme',
  missingDefaultSrc: 'csp.missing_default_src',
  missingObjectSrc: 'csp.missing_object_src',
  missingFrameAncestors: 'csp.missing_frame_ancestors',
  missingBaseUri: 'csp.missing_base_uri',
  missingFormAction: 'csp.missing_form_action',
  noReporting: 'csp.no_reporting',
} as const;

const FETCH_DIRECTIVES_NEEDING_DEFAULT = 'unlisted fetch directives fall back to allowing everything';

export function auditCsp(report: CspReport | undefined): CspAuditFinding[] {
  const findings: CspAuditFinding[] = [];
  if (report === undefined) return findings;

  const seen = new Set<string>();
  const add = (
    ruleId: string,
    severity: CspAuditSeverity,
    directive: string | null,
    detail: string,
  ): void => {
    // The same rule can legitimately fire on different directives (e.g. a
    // wildcard in both img-src and style-src), so dedup on rule + directive.
    const key = `${ruleId}|${directive ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ ruleId, severity, directive, detail });
  };

  const names = new Set(report.directives.map((d) => d.name));
  const counts = new Map<string, number>();

  for (const d of report.directives) {
    counts.set(d.name, (counts.get(d.name) ?? 0) + 1);

    for (const raw of d.sources) {
      const s = raw.toLowerCase();
      if (s === "'unsafe-inline'" && (d.name === 'script-src' || d.name === 'style-src')) {
        add(
          CSP_DIAGNOSTIC_CODES.unsafeInline,
          d.name === 'script-src' ? 'high' : 'medium',
          d.name,
          `${d.name} allows 'unsafe-inline'`,
        );
      }
      if (s === "'unsafe-eval'") {
        add(CSP_DIAGNOSTIC_CODES.unsafeEval, 'high', d.name, `${d.name} allows 'unsafe-eval'`);
      }
      if (s === '*') {
        add(CSP_DIAGNOSTIC_CODES.wildcard, 'medium', d.name, `${d.name} uses a wildcard '*' source`);
      }
      if (s === 'data:' && d.name === 'script-src') {
        add(CSP_DIAGNOSTIC_CODES.dataUri, 'high', d.name, 'script-src allows data: URIs (script injection risk)');
      }
      if (s === 'http:' || s.startsWith('http://') || s.startsWith('ws://')) {
        add(
          CSP_AUDIT_CODES.insecureScheme,
          'medium',
          d.name,
          `${d.name} allows an insecure (non-TLS) source "${raw}"`,
        );
      }
      if (s === 'https:') {
        add(
          CSP_AUDIT_CODES.broadScheme,
          'low',
          d.name,
          `${d.name} uses scheme-only 'https:' — allows any host over HTTPS`,
        );
      }
    }
  }

  for (const [name, n] of counts) {
    if (n > 1) {
      add(CSP_DIAGNOSTIC_CODES.duplicate, 'medium', name, `directive "${name}" appears ${n}× — only the first applies`);
    }
  }

  // Whole-policy posture checks.
  if (!names.has('default-src')) {
    add(CSP_AUDIT_CODES.missingDefaultSrc, 'medium', null, `no default-src — ${FETCH_DIRECTIVES_NEEDING_DEFAULT}`);
  }
  const objectSrc = report.directives.find((d) => d.name === 'object-src');
  if (objectSrc === undefined || !objectSrc.sources.map((x) => x.toLowerCase()).includes("'none'")) {
    add(CSP_AUDIT_CODES.missingObjectSrc, 'low', 'object-src', "object-src is not 'none' — consider disabling plugins/embeds");
  }
  if (!names.has('frame-ancestors')) {
    add(CSP_AUDIT_CODES.missingFrameAncestors, 'low', 'frame-ancestors', 'no frame-ancestors — clickjacking is not restricted by CSP');
  }
  if (!names.has('base-uri')) {
    add(CSP_AUDIT_CODES.missingBaseUri, 'low', 'base-uri', 'no base-uri — a <base> tag injection can re-root relative URLs');
  }
  if (!names.has('form-action')) {
    add(CSP_AUDIT_CODES.missingFormAction, 'low', 'form-action', 'no form-action — form submission targets are not restricted');
  }
  if (!names.has('report-uri') && !names.has('report-to')) {
    add(CSP_AUDIT_CODES.noReporting, 'info', null, 'no report-uri/report-to — CSP violations are not reported anywhere');
  }

  return findings.sort(
    (a, b) =>
      CSP_AUDIT_SEVERITY_RANK[a.severity] - CSP_AUDIT_SEVERITY_RANK[b.severity] ||
      a.ruleId.localeCompare(b.ruleId) ||
      (a.directive ?? '').localeCompare(b.directive ?? ''),
  );
}
