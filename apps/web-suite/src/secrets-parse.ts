import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildSecretsRegistration,
  FIXED_CLOCK,
  SECRET_KIND_REPORT,
  type SecretFinding,
  type SecretReportArtifact,
} from '@nekotools/lens-secrets';
import type { Diagnostic } from '@nekotools/contracts';

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

export interface SecretsView {
  readonly findingCount: number;
  readonly findings: readonly SecretFinding[];
  readonly json: string;
  readonly csv: string;
  readonly markdown: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

export function scanSecrets(raw: string): SecretsView {
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

  return {
    findingCount: value?.findingCount ?? 0,
    findings: value?.findings ?? [],
    json: run('secret.export.json', '{}'),
    csv: run('secret.export.csv', ''),
    markdown: run('secret.export.markdown.summary', ''),
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}
