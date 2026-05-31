import type { Exporter } from '@nekotools/contracts';

import { toYamlString } from './yaml-adapter.js';
import { fidelityNotesFromDocs, roundtripDiffReport, structureReport } from './codegen.js';
import {
  YAML_DOCUMENT_EXPORT_KINDS,
  YAML_KIND_DOCUMENT,
  YAML_KIND_JSON_PROJECTION,
  type YamlArtifact,
  type YamlDocValue,
  type YamlDocumentArtifact,
  type YamlJsonProjectionArtifact,
} from './kinds.js';

const TOOL_ID = 'yaml';

function pickDocuments(artifacts: readonly YamlArtifact[]): readonly YamlDocumentArtifact[] {
  return artifacts.filter((a): a is YamlDocumentArtifact => a.kind === YAML_KIND_DOCUMENT);
}

function pickProjection(
  artifacts: readonly YamlArtifact[],
): YamlJsonProjectionArtifact | undefined {
  return artifacts.find(
    (a): a is YamlJsonProjectionArtifact => a.kind === YAML_KIND_JSON_PROJECTION,
  );
}

/** All document data across the given artifacts, flattened in order. */
function allDocData(docs: readonly YamlDocumentArtifact[]): unknown[] {
  return docs.flatMap((d) => d.value.documents.map((x) => x.data));
}

/** Every parsed `YamlDocValue` across the document artifacts, in order. */
function allDocValues(docs: readonly YamlDocumentArtifact[]): readonly YamlDocValue[] {
  return docs.flatMap((d) => d.value.documents);
}

/**
 * The lossy-conversion notes to surface in a Pro report. Prefer the
 * parser's own `yaml.json-projection` `lossyNotes` when the caller passed
 * that artifact; otherwise recompute them from the documents' anchor/alias
 * metadata so the output is identical either way.
 */
function lossyNotesFor(artifacts: readonly YamlArtifact[]): readonly string[] {
  const projection = pickProjection(artifacts);
  if (projection !== undefined) return projection.value.lossyNotes;
  return fidelityNotesFromDocs(allDocValues(pickDocuments(artifacts)));
}

/** Pro exporters accept the projection too, so they can read its real
 * `lossyNotes`; the parser emits both artifacts in one run. */
const YAML_PRO_EXPORT_KINDS = [YAML_KIND_DOCUMENT, YAML_KIND_JSON_PROJECTION] as const;

/** Single value when there is exactly one document, else an array. */
function jsonProjection(docs: readonly YamlDocumentArtifact[]): unknown {
  const all = allDocData(docs);
  return all.length === 1 ? all[0] : all;
}

export const jsonExporter: Exporter<YamlArtifact> = {
  version: 1,
  id: 'yaml.export.json',
  toolId: TOOL_ID,
  target: 'json',
  accepts: YAML_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const body = JSON.stringify(jsonProjection(pickDocuments(artifacts)), null, 2);
    return { mimeType: 'application/json', extension: 'json', body };
  },
};

export const jsonMinExporter: Exporter<YamlArtifact> = {
  version: 1,
  id: 'yaml.export.json.min',
  toolId: TOOL_ID,
  target: 'json',
  accepts: YAML_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'application/json',
  producesExtension: 'json',
  export({ artifacts }) {
    const body = JSON.stringify(jsonProjection(pickDocuments(artifacts)));
    return { mimeType: 'application/json', extension: 'json', body };
  },
};

export const normalizedYamlExporter: Exporter<YamlArtifact> = {
  version: 1,
  id: 'yaml.export.yaml.normalized',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: YAML_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'application/yaml',
  producesExtension: 'yaml',
  export({ artifacts }) {
    const blocks = allDocData(pickDocuments(artifacts)).map((d) => toYamlString(d).replace(/\n$/, ''));
    const body = blocks.join('\n---\n');
    return { mimeType: 'application/yaml', extension: 'yaml', body };
  },
};

export const pathsExporter: Exporter<YamlArtifact> = {
  version: 1,
  id: 'yaml.export.paths',
  toolId: TOOL_ID,
  target: 'plaintext',
  accepts: YAML_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'text/plain',
  producesExtension: 'txt',
  export({ artifacts }) {
    const out: string[] = [];
    allDocData(pickDocuments(artifacts)).forEach((data, i, arr) => {
      const prefix = arr.length > 1 ? `[doc ${i}]` : '';
      flattenPaths(data, prefix, out);
    });
    return { mimeType: 'text/plain', extension: 'txt', body: out.join('\n') };
  },
};

export const markdownSummaryExporter: Exporter<YamlArtifact> = {
  version: 1,
  id: 'yaml.export.markdown.summary',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: YAML_DOCUMENT_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts, diagnostics }) {
    const docs = pickDocuments(artifacts);
    const lines: string[] = ['# NekoYAML export', ''];
    const flat = docs.flatMap((d) => d.value.documents);
    lines.push(`## Documents (${flat.length})`, '');
    flat.forEach((doc, i) => {
      lines.push(
        `- **doc ${i}** — ${describeShape(doc.data)}; anchors: ${doc.hasAnchors ? 'yes' : 'no'}, aliases: ${doc.hasAliases ? 'yes' : 'no'}`,
      );
    });
    lines.push('');
    if (diagnostics.length > 0) {
      lines.push('## Diagnostics', '');
      for (const d of diagnostics) {
        lines.push(`- **${d.severity.toUpperCase()}** \`${d.code}\` — ${d.message}`);
      }
      lines.push('');
    }
    return { mimeType: 'text/markdown', extension: 'md', body: lines.join('\n') };
  },
};

function describeShape(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array (${value.length} item${value.length === 1 ? '' : 's'})`;
  if (typeof value === 'object') {
    const n = Object.keys(value as Record<string, unknown>).length;
    return `mapping (${n} key${n === 1 ? '' : 's'})`;
  }
  return typeof value;
}

function flattenPaths(value: unknown, prefix: string, out: string[]): void {
  if (value !== null && typeof value === 'object') {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        out.push(`${prefix || '(root)'}: []`);
        return;
      }
      value.forEach((v, i) => flattenPaths(v, prefix ? `${prefix}[${i}]` : `[${i}]`, out));
      return;
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      out.push(`${prefix || '(root)'}: {}`);
      return;
    }
    for (const [k, v] of entries) flattenPaths(v, prefix ? `${prefix}.${k}` : k, out);
    return;
  }
  out.push(`${prefix || '(root)'}: ${JSON.stringify(value)}`);
}

export const freeExporters: readonly Exporter<YamlArtifact>[] = [
  jsonExporter,
  jsonMinExporter,
  normalizedYamlExporter,
  pathsExporter,
  markdownSummaryExporter,
];

// --- Pro exporters (registered in the binary, gated by entitlement) --------
//
// These back the manifest's declared Pro exporter ids (`schema.validate` /
// `diff.roundtrip`). Each derives purely from the already-parsed
// `yaml.document` (plus the parser's `yaml.json-projection` `lossyNotes` when
// present) — no network, no clock, no schema engine. Generation lives in
// `codegen.ts`, scoped HONESTLY to what is buildable offline: a structure
// report (NOT schema validation / inference — see `outOfScope`) and a
// structural round-trip fidelity report (NOT a byte-level source diff).

/**
 * `yaml.export.schema.report` (Pro) — a Markdown STRUCTURE report of the
 * parsed stream: per-document top-level shape, anchor/alias presence, and
 * the projection's lossy notes. Deliberately not schema validation and not
 * schema inference (manifest `outOfScope`).
 */
export const schemaReportExporter: Exporter<YamlArtifact> = {
  version: 1,
  id: 'yaml.export.schema.report',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: YAML_PRO_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const docs = allDocValues(pickDocuments(artifacts));
    const body = structureReport(docs, lossyNotesFor(artifacts));
    return { mimeType: 'text/markdown', extension: 'md', body };
  },
};

/**
 * `yaml.export.roundtrip.diff` (Pro) — a Markdown YAML<->JSON round-trip
 * FIDELITY report: renders each parsed document back to YAML, re-projects to
 * JSON, and reports what survives plus the lossy notes. Structural fidelity
 * from the parsed data, not a byte-level source diff.
 */
export const roundtripDiffExporter: Exporter<YamlArtifact> = {
  version: 1,
  id: 'yaml.export.roundtrip.diff',
  toolId: TOOL_ID,
  target: 'markdown',
  accepts: YAML_PRO_EXPORT_KINDS,
  producesMimeType: 'text/markdown',
  producesExtension: 'md',
  export({ artifacts }) {
    const docs = allDocValues(pickDocuments(artifacts));
    const body = roundtripDiffReport(docs, lossyNotesFor(artifacts));
    return { mimeType: 'text/markdown', extension: 'md', body };
  },
};

export const proExporters: readonly Exporter<YamlArtifact>[] = [
  schemaReportExporter,
  roundtripDiffExporter,
];
