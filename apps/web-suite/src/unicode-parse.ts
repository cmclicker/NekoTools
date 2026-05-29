import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildUnicodeRegistration,
  FIXED_CLOCK,
  UNICODE_KIND_PARSED,
  type CodepointInfo,
  type UnicodeParsedArtifact,
} from '@nekotools/lens-unicode';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoUnicode UI parse helper, extracted out of UnicodeApp for testability.
 * Output strings come from the real engine exporters.
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildUnicodeRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedUnicodeView {
  readonly codepointCount: number;
  readonly utf16UnitCount: number;
  readonly byteLength: number;
  readonly codepoints: readonly CodepointInfo[];
  readonly truncated: boolean;
  readonly json: string;
  readonly normalized: string;
  readonly markdown: string;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseUnicodeInput(raw: string): ParsedUnicodeView {
  const result = runParser(registry, 'unicode', 'unicode.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });

  const artifact = result.artifacts.find(
    (a): a is UnicodeParsedArtifact => a.kind === UNICODE_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'unicode', id, exportInput).body) : fallback;

  return {
    codepointCount: value?.codepointCount ?? 0,
    utf16UnitCount: value?.utf16UnitCount ?? 0,
    byteLength: value?.byteLength ?? 0,
    codepoints: value?.codepoints ?? [],
    truncated: value?.truncated ?? false,
    json: run('unicode.export.json', 'null'),
    normalized: run('unicode.export.normalized', ''),
    markdown: run('unicode.export.markdown.summary', ''),
    diagnostics: result.diagnostics,
  };
}
