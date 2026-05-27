import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildYamlRegistration,
  FIXED_CLOCK,
  YAML_KIND_DOCUMENT,
  type YamlDocument,
  type YamlDocumentArtifact,
} from '@nekotools/lens-yaml';
import type { Diagnostic } from '@nekotools/contracts';

/**
 * NekoYAML UI parse helper, extracted out of YamlApp for testability —
 * the same engine-adapter seam NekoJSON's `parse-input.ts`, NekoEnv's
 * `env-parse.ts`, and NekoLogs' `logs-parse.ts` provide.
 *
 * `source.bytes` is the UTF-8 byte length (not `raw.length`, which counts
 * UTF-16 code units), matching what the engine's `yaml.text` parser uses
 * for its large-document threshold. The registry is a module singleton so
 * parser identity is stable across App re-renders.
 */

const SHARED_UTF8_ENCODER = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildYamlRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedYaml {
  /** The primary yaml.document, or null when the run emitted none. */
  readonly document: YamlDocument | null;
  /** YAML -> JSON projection, pretty-printed; null when there is no document. */
  readonly jsonOutput: string | null;
  /** Normalized (canonical) YAML re-emit; null when there is no document. */
  readonly normalizedYaml: string | null;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

/**
 * Run `yaml.text` over raw YAML input and render the engine's JSON +
 * normalized-YAML exporters. Output strings come from the real engine
 * exporters (not re-derived in the UI), so the tab can't drift from the
 * engine's behavior.
 */
export function parseYamlText(raw: string): ParsedYaml {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'yaml', 'yaml.text', {
    raw,
    source: { kind: 'paste', bytes },
  });

  const documentArtifact = result.artifacts.find(
    (a): a is YamlDocumentArtifact => a.kind === YAML_KIND_DOCUMENT,
  );

  let jsonOutput: string | null = null;
  let normalizedYaml: string | null = null;
  if (documentArtifact !== undefined && documentArtifact.value.documents.length > 0) {
    jsonOutput = String(
      runExporter(registry, 'yaml', 'yaml.export.json', {
        artifacts: [documentArtifact],
        diagnostics: [],
      }).body,
    );
    normalizedYaml = String(
      runExporter(registry, 'yaml', 'yaml.export.yaml.normalized', {
        artifacts: [documentArtifact],
        diagnostics: [],
      }).body,
    );
  }

  return {
    document: documentArtifact?.value ?? null,
    jsonOutput,
    normalizedYaml,
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}
