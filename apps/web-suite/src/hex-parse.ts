import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildHexRegistration,
  FIXED_CLOCK,
  HEX_KIND_PARSED,
  type DumpRow,
  type HexMode,
  type HexParsedArtifact,
} from '@nekotools/lens-hex';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoHex UI parse helper, extracted out of HexApp for testability. The
 * `mode` is forwarded as a parser hint; output strings come from the real
 * engine exporters.
 */

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildHexRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedHexView {
  readonly mode: HexMode;
  readonly valid: boolean;
  readonly byteLength: number;
  readonly hex: string;
  readonly rows: readonly DumpRow[];
  readonly dump: string;
  readonly json: string;
  readonly markdown: string;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseHexInput(raw: string, mode: HexMode): ParsedHexView {
  const result = runParser(registry, 'hex', 'hex.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
    hints: { mode },
  });

  const artifact = result.artifacts.find(
    (a): a is HexParsedArtifact => a.kind === HEX_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };
  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'hex', id, exportInput).body) : fallback;

  return {
    mode: value?.mode ?? mode,
    valid: value?.valid ?? false,
    byteLength: value?.byteLength ?? 0,
    hex: value?.hex ?? '',
    rows: value?.rows ?? [],
    dump: run('hex.export.normalized', ''),
    json: run('hex.export.json', 'null'),
    markdown: run('hex.export.markdown.summary', ''),
    diagnostics: result.diagnostics,
  };
}
