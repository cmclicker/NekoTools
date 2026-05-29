import { canonicalize } from '@nekotools/lens-json';
import { ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildYamlRegistration,
  FIXED_CLOCK,
  YAML_KIND_DOCUMENT,
  type YamlDocumentArtifact,
} from '@nekotools/lens-yaml';

/**
 * Outcome of reducing one side to a comparable, normalized string form.
 * `normalized` is null when the side could not be parsed; `error` then
 * carries the message for a `diff.parse_error` diagnostic.
 */
export interface NormalizeResult {
  readonly normalized: string | null;
  readonly error: string | null;
}

/**
 * Normalize one side as JSON: parse, then re-emit in canonical form
 * (recursively key-sorted, 2-space indent) by reusing NekoJSON's
 * `canonicalize`, so a NekoDiff JSON comparison matches what NekoJSON
 * itself would show and reordered keys produce no diff noise. A parse
 * failure returns the error for a diagnostic.
 */
export function normalizeJson(raw: string): NormalizeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { normalized: null, error: err instanceof Error ? err.message : String(err) };
  }
  // `canonicalize` only throws for non-JSON-root values (undefined / fn /
  // symbol); `JSON.parse` never yields those, so this is safe here.
  return { normalized: canonicalize(parsed), error: null };
}

// A single internal NekoYAML registry. Building one is pure/deterministic
// and is reused across calls (mirrors the web-suite engine-adapter
// singletons). The fixed clock is irrelevant: only the normalized YAML body
// is read, never the artifact timestamps.
const yamlRegistry = (() => {
  const r = new ToolRegistry();
  r.register(buildYamlRegistration(FIXED_CLOCK('1970-01-01T00:00:00.000Z')));
  return r;
})();

/**
 * Normalize one side as YAML by reusing @nekotools/lens-yaml through its
 * public registry surface (its `yaml` adapter is intentionally not
 * exported): parse via `yaml.text`, then re-emit canonical YAML via the
 * `yaml.export.yaml.normalized` exporter. An error-severity parse
 * diagnostic is reported as a parse failure; an empty / comments-only side
 * normalizes to the empty string (zero lines), not a failure.
 */
export function normalizeYaml(raw: string): NormalizeResult {
  const result = runParser(yamlRegistry, 'yaml', 'yaml.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
  const firstError = result.diagnostics.find((d) => d.severity === 'error');
  if (firstError !== undefined) {
    return { normalized: null, error: firstError.message };
  }
  const doc = result.artifacts.find(
    (a): a is YamlDocumentArtifact => a.kind === YAML_KIND_DOCUMENT,
  );
  if (doc === undefined || doc.value.documents.length === 0) {
    return { normalized: '', error: null };
  }
  const normalized = String(
    runExporter(yamlRegistry, 'yaml', 'yaml.export.yaml.normalized', {
      artifacts: [doc],
      diagnostics: [],
    }).body,
  );
  return { normalized, error: null };
}
