import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { parseYaml, type AdapterIssue } from './yaml-adapter.js';
import {
  DEFAULT_LARGE_DOCUMENT_BYTES,
  YAML_DIAGNOSTIC_CODES,
  makeDiagnostic,
  mapIssueCode,
} from './diagnostics.js';
import {
  YAML_KIND_DOCUMENT,
  YAML_KIND_JSON_PROJECTION,
  type YamlArtifact,
  type YamlDocValue,
  type YamlDocument,
  type YamlDocumentArtifact,
  type YamlJsonProjection,
  type YamlJsonProjectionArtifact,
} from './kinds.js';

const TOOL_ID = 'yaml';
const PARSER_ID = 'yaml.text';

export interface YamlTextParserDeps {
  readonly clock: Clock;
  /** Soft byte threshold for `yaml.large_document`. Defaults to 10 MB. */
  readonly largeDocumentBytes?: number;
}

/**
 * The `yaml.text` parser. Accepts raw YAML (including multi-document
 * `---` streams) and emits two artifacts in one run: the primary
 * `yaml.document` plus a derived `yaml.json-projection` (a pure function
 * of the document, so it cannot drift). Never throws — every malformed
 * input produces structured diagnostics.
 */
export function createYamlTextParser(deps: YamlTextParserDeps): Parser<YamlArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text', 'yaml', 'yml'],
    produces: [YAML_KIND_DOCUMENT, YAML_KIND_JSON_PROJECTION],
    parse(input: ParserInput): ParserResult<YamlArtifact> {
      return parseYamlText(input, deps);
    },
  };
}

function parseYamlText(input: ParserInput, deps: YamlTextParserDeps): ParserResult<YamlArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  const parsed = parseYaml(input.raw);

  // Per-document, per-issue diagnostics from the YAML library.
  for (const doc of parsed.documents) {
    for (const issue of [...doc.errors, ...doc.warnings]) {
      diagnostics.push(toDiagnostic(diagIds(), issue));
    }
  }

  const docValues: YamlDocValue[] = parsed.documents.map((d) => ({
    data: d.data,
    hasAnchors: d.hasAnchors,
    hasAliases: d.hasAliases,
    anchorNames: d.anchorNames,
  }));

  // Empty / comments-only input: zero documents. Always still produce an
  // artifact (charter policy), emit `yaml.empty_input` at info.
  if (docValues.length === 0) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        YAML_DIAGNOSTIC_CODES.emptyInput,
        input.raw.trim() === ''
          ? 'input is empty'
          : 'input contains no YAML documents (comments / directives only)',
      ),
    );
  }

  if (docValues.length > 1) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        YAML_DIAGNOSTIC_CODES.multipleDocuments,
        `input contains ${docValues.length} documents`,
      ),
    );
  }

  const threshold = deps.largeDocumentBytes ?? DEFAULT_LARGE_DOCUMENT_BYTES;
  const actualBytes = utf8ByteLength(input.raw);
  if (actualBytes > threshold) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        YAML_DIAGNOSTIC_CODES.largeDocument,
        `document is ${actualBytes} bytes; exceeds soft threshold of ${threshold} bytes`,
      ),
    );
  }

  const document: YamlDocument = {
    documents: docValues,
    multiDocument: docValues.length > 1,
  };
  const documentArtifact: YamlDocumentArtifact = {
    version: 1,
    kind: YAML_KIND_DOCUMENT,
    id: artIds(),
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt: deps.clock.now(),
    source: input.source,
    value: document,
  };

  const projection: YamlJsonProjection = buildProjection(docValues);
  const projectionArtifact: YamlJsonProjectionArtifact = {
    version: 1,
    kind: YAML_KIND_JSON_PROJECTION,
    id: artIds(),
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt: deps.clock.now(),
    source: { kind: 'derived', from: [documentArtifact.id] },
    value: projection,
  };

  return { artifacts: [documentArtifact, projectionArtifact], diagnostics };
}

function toDiagnostic(id: string, issue: AdapterIssue): Diagnostic {
  const mapped = mapIssueCode(issue.code, issue.severity);
  const span: Diagnostic['span'] = {
    startOffset: issue.position.offset,
    endOffset: issue.position.offset,
    startLine: issue.position.line,
    startColumn: issue.position.column,
  };
  return makeDiagnostic(id, mapped.severity, mapped.code, issue.message, span);
}

function buildProjection(docs: readonly YamlDocValue[]): YamlJsonProjection {
  const multiDocument = docs.length > 1;
  const json = docs.length === 1 ? docs[0]!.data : docs.map((d) => d.data);
  const lossyNotes: string[] = [];
  if (docs.some((d) => d.hasAnchors || d.hasAliases)) {
    lossyNotes.push('anchors/aliases are expanded inline in the JSON projection');
  }
  lossyNotes.push('YAML comments are not represented in JSON');
  return { json, multiDocument, lossyNotes };
}

const SHARED_UTF8_ENCODER = new TextEncoder();
function utf8ByteLength(s: string): number {
  return SHARED_UTF8_ENCODER.encode(s).byteLength;
}
