import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildCronRegistration,
  FIXED_CLOCK,
  CRON_KIND_PARSED,
  type CronField,
  type CronParsedArtifact,
} from '@nekotools/lens-cron';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoCron UI parse helper, extracted out of CronApp for testability — the
 * same engine-adapter seam the other tools' `*-parse.ts` modules provide.
 * Next-run times use a clock seeded at module load so the UI shows runs
 * relative to "now"; output strings come from the real engine exporters.
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildCronRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedCronView {
  readonly valid: boolean;
  readonly expression: string;
  readonly description: string;
  readonly fields: readonly CronField[] | null;
  readonly nextRuns: readonly string[];
  readonly json: string;
  readonly markdown: string;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseCronInput(raw: string): ParsedCronView {
  const result = runParser(registry, 'cron', 'cron.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });

  const artifact = result.artifacts.find(
    (a): a is CronParsedArtifact => a.kind === CRON_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'cron', id, exportInput).body) : fallback;

  return {
    valid: value?.valid ?? false,
    expression: value?.expression ?? '',
    description: value?.description ?? '',
    fields: value?.fields ?? null,
    nextRuns: value?.nextRuns ?? [],
    json: run('cron.export.json', 'null'),
    markdown: run('cron.export.markdown.summary', ''),
    diagnostics: result.diagnostics,
  };
}
