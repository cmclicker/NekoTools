import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildCspRegistration,
  FIXED_CLOCK,
  CSP_KIND_PARSED,
  type CspDirective,
  type CspFinding,
  type CspParsedArtifact,
} from '@nekotools/lens-csp';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoCSP UI parse helper, extracted out of CspApp for testability. Output
 * strings come from the real engine exporters.
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildCspRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedCspView {
  readonly directives: readonly CspDirective[];
  readonly directiveCount: number;
  readonly findings: readonly CspFinding[];
  readonly json: string;
  readonly normalized: string;
  readonly markdown: string;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseCspInput(raw: string): ParsedCspView {
  const result = runParser(registry, 'csp', 'csp.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });

  const artifact = result.artifacts.find(
    (a): a is CspParsedArtifact => a.kind === CSP_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'csp', id, exportInput).body) : fallback;

  return {
    directives: value?.directives ?? [],
    directiveCount: value?.directiveCount ?? 0,
    findings: value?.findings ?? [],
    json: run('csp.export.json', '{}'),
    normalized: run('csp.export.normalized', ''),
    markdown: run('csp.export.markdown.summary', ''),
    diagnostics: result.diagnostics,
  };
}
