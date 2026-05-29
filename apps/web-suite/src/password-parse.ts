import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildPasswordRegistration,
  FIXED_CLOCK,
  PASSWORD_KIND_REPORT,
  type CrackTime,
  type PasswordReport,
  type PasswordReportArtifact,
} from '@nekotools/lens-password';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoPassword UI parse helper, extracted out of PasswordApp for
 * testability. The password is only ever passed to the parser; the engine
 * returns metrics only, and the markdown/JSON come from the real exporters.
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
  readonly diagnostics: readonly Diagnostic[];
}

export function assessPasswordInput(raw: string): PasswordView {
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

  return {
    report,
    crackTimes: report?.crackTimes ?? [],
    json: run('password.export.json', 'null'),
    markdown: run('password.export.markdown.summary', ''),
    diagnostics: result.diagnostics,
  };
}
