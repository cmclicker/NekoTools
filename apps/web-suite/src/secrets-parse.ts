import { ToolRegistry, runExporter, runParser, FREE_ENTITLEMENT } from '@nekotools/tool-runtime';
import {
  buildSecretsRegistration,
  FIXED_CLOCK,
  SECRET_KIND_REPORT,
  type SecretFinding,
  type SecretReportArtifact,
} from '@nekotools/lens-secrets';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoSecrets UI parse helper, extracted out of SecretsApp for testability
 * — the same engine-adapter seam the other tools' `*-parse.ts` modules
 * provide. Findings carry only masked previews; output strings come from
 * the real engine exporters so the tab can't drift from the engine.
 */

const SHARED_UTF8_ENCODER = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildSecretsRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface SeverityCounts {
  readonly high: number;
  readonly medium: number;
  readonly low: number;
}

export interface SecretsView {
  readonly findingCount: number;
  readonly findings: readonly SecretFinding[];
  readonly severityCounts: SeverityCounts;
  readonly json: string;
  readonly csv: string;
  readonly markdown: string;
  /** Pro: SARIF 2.1.0, or null when not entitled. */
  readonly sarif: string | null;
  /** Pro: redacted source text, or null when not entitled. */
  readonly redacted: string | null;
  /** Pro: self-contained HTML report, or null when not entitled. */
  readonly html: string | null;
  /** Pro: deterministic CI baseline JSON, or null when not entitled. */
  readonly baseline: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

export function scanSecrets(raw: string, entitlement: Entitlement = FREE_ENTITLEMENT): SecretsView {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'secrets', 'secret.text', {
    raw,
    source: { kind: 'paste', bytes },
  });

  const artifact = result.artifacts.find(
    (a): a is SecretReportArtifact => a.kind === SECRET_KIND_REPORT,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'secrets', id, exportInput).body) : fallback;
  // Pro exporters are gated: runExporter throws EntitlementError when free.
  const runPro = (id: string): string | null => {
    if (!artifact) return null;
    try {
      return String(runExporter(registry, 'secrets', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  const proUnlocked = entitlement.tier !== 'free';
  const findings = value?.findings ?? [];
  const severityCounts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) severityCounts[f.severity] += 1;
  return {
    findingCount: value?.findingCount ?? 0,
    findings,
    severityCounts,
    json: run('secret.export.json', '{}'),
    csv: run('secret.export.csv', ''),
    markdown: run('secret.export.markdown.summary', ''),
    sarif: runPro('secret.export.sarif'),
    redacted: runPro('secret.export.redacted'),
    html: runPro('secret.export.html'),
    baseline: runPro('secret.export.baseline'),
    proUnlocked,
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}
