import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildMimeRegistration,
  FIXED_CLOCK,
  MIME_KIND_PARSED,
  type MimeEntry,
  type MimeParsedArtifact,
} from '@nekotools/lens-mime';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoMIME UI parse helper, extracted out of MimeApp for testability.
 * Output strings come from the real engine exporters.
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildMimeRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedMimeView {
  readonly count: number;
  readonly entries: readonly MimeEntry[];
  readonly json: string;
  readonly normalized: string;
  readonly markdown: string;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseMimeInput(raw: string): ParsedMimeView {
  const result = runParser(registry, 'mime', 'mime.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });

  const artifact = result.artifacts.find(
    (a): a is MimeParsedArtifact => a.kind === MIME_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'mime', id, exportInput).body) : fallback;

  return {
    count: value?.count ?? 0,
    entries: value?.entries ?? [],
    json: run('mime.export.json', '{}'),
    normalized: run('mime.export.normalized', ''),
    markdown: run('mime.export.markdown.summary', ''),
    diagnostics: result.diagnostics,
  };
}
