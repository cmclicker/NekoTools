import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildHexRegistration,
  FIXED_CLOCK,
  HEX_KIND_PARSED,
  type DumpRow,
  type HexMode,
  type HexParsedArtifact,
} from '@nekotools/lens-hex';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoHex UI parse helper, extracted out of HexApp for testability. The
 * `mode` is forwarded as a parser hint; output strings come from the real
 * engine exporters. The Pro C-array + base64 byte exports are gated:
 * `runExporter` throws EntitlementError for a free caller, surfaced here as
 * null so the UI shows the Pro-lock (same pattern as headers-parse.ts).
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
  /** Pro: bytes as a C unsigned-char array, or null when not entitled. */
  readonly cArray: string | null;
  /** Pro: bytes as a standard base64 string, or null when not entitled. */
  readonly base64: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseHexInput(
  raw: string,
  mode: HexMode,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedHexView {
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
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'hex', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    mode: value?.mode ?? mode,
    valid: value?.valid ?? false,
    byteLength: value?.byteLength ?? 0,
    hex: value?.hex ?? '',
    rows: value?.rows ?? [],
    dump: run('hex.export.normalized', ''),
    json: run('hex.export.json', 'null'),
    markdown: run('hex.export.markdown.summary', ''),
    cArray: runPro('hex.export.c-array'),
    base64: runPro('hex.export.base64'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
  };
}
