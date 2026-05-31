import { parseYaml, toYamlString } from './yaml-adapter.js';
import type { YamlDocValue } from './kinds.js';

/**
 * NekoYAML Pro code generation. Backs the declared Pro exporters
 * `yaml.export.schema.report` (pro entitlement `schema.validate`) and
 * `yaml.export.roundtrip.diff` (pro entitlement `diff.roundtrip`).
 *
 * Both are pure, deterministic, offline functions of an already-parsed
 * `yaml.document` (plus the parser's `yaml.json-projection` `lossyNotes`
 * when available) — no network, no clock, no schema engine, no premium
 * dependency.
 *
 * SCOPE NOTE (manifest `outOfScope`): NekoYAML forbids
 * "Kubernetes / GitHub Actions / OpenAPI schema validation" and
 * "schema inference over YAML". So `schema.report` is deliberately NOT a
 * schema-validation report and does NOT infer a schema. It is a STRUCTURE
 * report: it describes the shape the parser already produced (top-level
 * type, key list / array length, anchor/alias presence already recorded on
 * each `YamlDocValue`, multi-document count) and surfaces the projection's
 * `lossyNotes`. This is descriptive analysis of the parsed structure, not
 * validation against an external schema and not inference of a new one.
 */

// --- shared shape description ---------------------------------------------

/** The top-level value type of one parsed document, by structural kind. */
function topLevelType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'sequence';
  if (typeof value === 'object') return 'mapping';
  return typeof value;
}

/** A one-line shape descriptor for a document's top-level value. */
function describeTopLevel(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `sequence (${value.length} item${value.length === 1 ? '' : 's'})`;
  }
  if (typeof value === 'object') {
    const n = Object.keys(value as Record<string, unknown>).length;
    return `mapping (${n} key${n === 1 ? '' : 's'})`;
  }
  return `scalar (${typeof value})`;
}

/** Top-level mapping keys, in document order; empty for non-mappings. */
function topLevelKeys(value: unknown): readonly string[] {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>);
  }
  return [];
}

/**
 * Notes on what does not survive YAML -> JSON, derived from a document's
 * own anchor/alias metadata. Used as a deterministic fallback when the
 * caller did not pass the parser's `yaml.json-projection` artifact (whose
 * `lossyNotes` say the same thing). Mirrors `parser-text.ts buildProjection`.
 */
export function fidelityNotesFromDocs(docs: readonly YamlDocValue[]): string[] {
  const notes: string[] = [];
  if (docs.some((d) => d.hasAnchors || d.hasAliases)) {
    notes.push('anchors/aliases are expanded inline in the JSON projection');
  }
  notes.push('YAML comments are not represented in JSON');
  return notes;
}

// --- yaml.export.schema.report (Pro) --------------------------------------

/**
 * Build a Markdown STRUCTURE report for a (possibly multi-document) YAML
 * stream. Per document it describes the top-level shape (type, keys or
 * length) and whether the parser recorded anchors/aliases; it then lists
 * the lossy-conversion notes. Not a schema-validation report and not schema
 * inference — purely descriptive of the already-parsed structure (see scope
 * note above).
 *
 * `lossyNotes` is the projection's own notes when the caller passed the
 * `yaml.json-projection` artifact; otherwise it is recomputed from each
 * document's anchor/alias metadata so the report is identical either way.
 */
export function structureReport(
  docs: readonly YamlDocValue[],
  lossyNotes: readonly string[],
): string {
  const lines: string[] = [
    '# NekoYAML structure report',
    '',
    '_Descriptive shape of the parsed YAML (not schema validation, not schema inference)._',
    '',
    `- documents: ${docs.length}`,
    `- multi-document: ${docs.length > 1 ? 'yes' : 'no'}`,
    '',
  ];

  if (docs.length === 0) {
    lines.push('_No documents parsed._');
    return lines.join('\n');
  }

  docs.forEach((doc, i) => {
    lines.push(`## Document ${i}`, '');
    lines.push(`- top-level type: ${topLevelType(doc.data)}`);
    lines.push(`- shape: ${describeTopLevel(doc.data)}`);
    const keys = topLevelKeys(doc.data);
    if (keys.length > 0) {
      lines.push(`- top-level keys: ${keys.map((k) => `\`${k}\``).join(', ')}`);
    } else if (Array.isArray(doc.data)) {
      lines.push(`- length: ${doc.data.length}`);
    }
    lines.push(`- anchors: ${doc.hasAnchors ? 'yes' : 'no'}`);
    lines.push(`- aliases: ${doc.hasAliases ? 'yes' : 'no'}`);
    if (doc.anchorNames.length > 0) {
      lines.push(`- anchor names: ${doc.anchorNames.map((n) => `\`${n}\``).join(', ')}`);
    }
    lines.push('');
  });

  lines.push('## Lossy conversion notes', '');
  if (lossyNotes.length === 0) {
    lines.push('- none');
  } else {
    for (const note of lossyNotes) lines.push(`- ${note}`);
  }

  return lines.join('\n');
}

// --- yaml.export.roundtrip.diff (Pro) -------------------------------------

/** Deep structural equality over JSON-safe values (order-sensitive for
 * mappings, matching `toYamlString` + `JSON.parse` key order). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    if (ka.length !== kb.length) return false;
    return ka.every((k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  return false;
}

/** One YAML <-> JSON round trip of a JSON-safe value: render to YAML, then
 * read that YAML's first document back to a JSON-safe value. Injectable so
 * the report stays pure/deterministic and the adapter is swappable. */
export type RoundtripFn = (value: unknown) => { yaml: string; back: unknown };

/** Default round trip: `toYamlString` then `parseYaml` of the result. */
export const defaultRoundtrip: RoundtripFn = (value) => {
  const yaml = toYamlString(value);
  const reparsed = parseYaml(yaml);
  const back = reparsed.documents.length > 0 ? reparsed.documents[0]!.data : null;
  return { yaml, back };
};

/**
 * Build a Markdown YAML<->JSON round-trip FIDELITY report. For each parsed
 * document it renders the data back to YAML via the adapter's
 * `toYamlString`, re-projects that YAML to a JSON-safe value, and reports
 * whether the structure survived (`deepEqual` of before/after), plus the
 * lossy notes (comments dropped, anchors/aliases expanded inline).
 *
 * This is a STRUCTURAL fidelity report from the parsed data + notes, not a
 * byte-level diff of the original source — the report says so explicitly,
 * and it needs no source bytes. The `roundtrip` injection point keeps the
 * render/reparse swappable and the function pure/deterministic.
 */
export function roundtripDiffReport(
  docs: readonly YamlDocValue[],
  lossyNotes: readonly string[],
  roundtrip: RoundtripFn = defaultRoundtrip,
): string {
  const lines: string[] = [
    '# NekoYAML round-trip fidelity report',
    '',
    '_Structural YAML <-> JSON fidelity from the parsed data (not a byte-level source diff)._',
    '',
    `- documents: ${docs.length}`,
    '',
  ];

  if (docs.length === 0) {
    lines.push('_No documents parsed._');
    return lines.join('\n');
  }

  docs.forEach((doc, i) => {
    // Render the parsed (already JSON-safe) data back to YAML, then re-parse
    // that YAML. A faithful structural round trip reproduces the value; any
    // divergence is reported as not-preserved.
    const { yaml, back } = roundtrip(doc.data);
    const survived = deepEqual(doc.data, back);
    lines.push(`## Document ${i}`, '');
    lines.push(`- top-level type: ${topLevelType(doc.data)}`);
    lines.push(`- structure preserved: ${survived ? 'yes' : 'no'}`);
    lines.push(`- anchors/aliases expanded on round trip: ${doc.hasAnchors || doc.hasAliases ? 'yes' : 'no'}`);
    lines.push(`- rendered YAML lines: ${yaml.split('\n').filter((l) => l.length > 0).length}`);
    lines.push('');
  });

  lines.push('## What does not survive', '');
  if (lossyNotes.length === 0) {
    lines.push('- none');
  } else {
    for (const note of lossyNotes) lines.push(`- ${note}`);
  }

  return lines.join('\n');
}
