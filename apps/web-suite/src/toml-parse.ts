import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildTomlRegistration,
  FIXED_CLOCK,
  TOML_KIND_PARSED,
  type ParsedToml,
  type TomlParsedArtifact,
  type TomlValue,
} from '@nekotools/lens-toml';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoTOML UI parse helper, extracted out of TomlApp for testability — the
 * same engine-adapter seam NekoJSON's `parse-input.ts`, NekoEnv's
 * `env-parse.ts`, NekoURL's `url-parse.ts`, and NekoCSV's `csv-parse.ts`
 * provide.
 *
 * `source.bytes` is the UTF-8 byte length (not `raw.length`, which counts
 * UTF-16 code units). The registry is a module singleton so parser
 * identity is stable across App re-renders.
 */

const SHARED_UTF8_ENCODER = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildTomlRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedTomlView {
  readonly valid: boolean;
  readonly data: TomlValue | null;
  readonly tableCount: number;
  readonly keyCount: number;
  /** Decoded tree as pretty JSON; `"null"` when invalid/empty. */
  readonly json: string;
  /** Canonical re-serialized TOML; `""` when invalid/empty. */
  readonly normalized: string;
  /** Markdown summary of the parse (shape + diagnostics). */
  readonly markdown: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

/**
 * Run `toml.text` over the raw input and render the engine's JSON,
 * normalized-TOML, and markdown exporters. Output strings come from the
 * real engine exporters (not re-derived in the UI), so the tab can't
 * drift from the engine's behavior.
 */
export function parseTomlInput(raw: string): ParsedTomlView {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'toml', 'toml.text', {
    raw,
    source: { kind: 'paste', bytes },
  });

  const artifact = result.artifacts.find(
    (a): a is TomlParsedArtifact => a.kind === TOML_KIND_PARSED,
  );
  const value: ParsedToml | undefined = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };

  const json = artifact
    ? String(runExporter(registry, 'toml', 'toml.export.json', exportInput).body)
    : 'null';
  const normalized = artifact
    ? String(runExporter(registry, 'toml', 'toml.export.normalized', exportInput).body)
    : '';
  const markdown = artifact
    ? String(runExporter(registry, 'toml', 'toml.export.markdown.summary', exportInput).body)
    : '';

  return {
    valid: value?.valid ?? false,
    data: value?.data ?? null,
    tableCount: value?.tableCount ?? 0,
    keyCount: value?.keyCount ?? 0,
    json,
    normalized,
    markdown,
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}
