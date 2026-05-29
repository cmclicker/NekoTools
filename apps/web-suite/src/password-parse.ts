import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildPasswordRegistration,
  FIXED_CLOCK,
  PASSWORD_KIND_REPORT,
  type CrackTime,
  type PasswordReport,
  type PasswordReportArtifact,
} from '@nekotools/lens-password';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoPassword UI parse helper, extracted out of PasswordApp for
 * testability. The password is only ever passed to the parser; the engine
 * returns metrics only, and every output string comes from the real
 * exporters (so the tab can't drift from the engine).
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildPasswordRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface PasswordView {
  readonly report: PasswordReport | null;
  readonly crackTimes: readonly CrackTime[];
  readonly json: string;
  readonly markdown: string;
  /** Pro: policy-compliance audit (markdown), or null when not entitled. */
  readonly policyReport: string | null;
  /** Pro: policy findings as CSV, or null when not entitled. */
  readonly auditCsv: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function assessPasswordInput(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): PasswordView {
  const result = runParser(registry, 'password', 'password.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });

  const artifact = result.artifacts.find(
    (a): a is PasswordReportArtifact => a.kind === PASSWORD_KIND_REPORT,
  );
  const report = artifact?.value ?? null;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'password', id, exportInput).body) : fallback;
  // Pro exporters are gated: runExporter throws EntitlementError when free.
  const runPro = (id: string): string | null => {
    if (!artifact) return null;
    try {
      return String(runExporter(registry, 'password', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    report,
    crackTimes: report?.crackTimes ?? [],
    json: run('password.export.json', 'null'),
    markdown: run('password.export.markdown.summary', ''),
    policyReport: runPro('password.export.policy.report'),
    auditCsv: runPro('password.export.audit.csv'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
  };
}
