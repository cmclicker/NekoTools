import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildYamlRegistration,
  FIXED_CLOCK,
  YAML_KIND_DOCUMENT,
  type YamlDocument,
  type YamlDocumentArtifact,
} from '@nekotools/lens-yaml';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

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
  /** Pro: Markdown structure report of the parsed stream, or null when not entitled. */
  readonly schemaReport: string | null;
  /** Pro: Markdown YAML<->JSON round-trip fidelity report, or null when not entitled. */
  readonly roundtripDiff: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

/**
 * Run `yaml.text` over raw YAML input and render the engine's JSON +
 * normalized-YAML exporters. Output strings come from the real engine
 * exporters (not re-derived in the UI), so the tab can't drift from the
 * engine's behavior. The Pro structure-report + round-trip-diff exports are
 * gated: `runExporter` throws EntitlementError for a free caller, surfaced
 * here as null so the UI shows the Pro-lock (same pattern as hex-parse.ts).
 */
export function parseYamlText(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedYaml {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'yaml', 'yaml.text', {
    raw,
    source: { kind: 'paste', bytes },
  });

  const documentArtifact = result.artifacts.find(
    (a): a is YamlDocumentArtifact => a.kind === YAML_KIND_DOCUMENT,
  );
  const hasDocuments =
    documentArtifact !== undefined && documentArtifact.value.documents.length > 0;
  const exportInput = {
    artifacts: documentArtifact ? [documentArtifact] : [],
    diagnostics: [],
  };
  const runPro = (id: string): string | null => {
    if (!hasDocuments) return null;
    try {
      return String(runExporter(registry, 'yaml', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  let jsonOutput: string | null = null;
  let normalizedYaml: string | null = null;
  if (hasDocuments) {
    jsonOutput = String(runExporter(registry, 'yaml', 'yaml.export.json', exportInput).body);
    normalizedYaml = String(
      runExporter(registry, 'yaml', 'yaml.export.yaml.normalized', exportInput).body,
    );
  }

  return {
    document: documentArtifact?.value ?? null,
    jsonOutput,
    normalizedYaml,
    schemaReport: runPro('yaml.export.schema.report'),
    roundtripDiff: runPro('yaml.export.roundtrip.diff'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}
