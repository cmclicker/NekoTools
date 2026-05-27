import type { Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { toJsonSafe } from './yaml-adapter.js';
import { YAML_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  YAML_KIND_DOCUMENT,
  type YamlArtifact,
  type YamlDocument,
  type YamlDocumentArtifact,
} from './kinds.js';

const TOOL_ID = 'yaml';
const PARSER_ID = 'yaml.from-json';

export interface YamlFromJsonParserDeps {
  readonly clock: Clock;
}

/**
 * The `yaml.from-json` parser. Accepts JSON text and produces a
 * `yaml.document`, which the normalized-YAML exporter renders as YAML —
 * the free JSON -> YAML conversion. Never throws: malformed JSON yields a
 * `yaml.syntax_error` diagnostic and no artifact.
 */
export function createYamlFromJsonParser(deps: YamlFromJsonParserDeps): Parser<YamlArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['json', 'text'],
    produces: [YAML_KIND_DOCUMENT],
    parse(input: ParserInput): ParserResult<YamlArtifact> {
      const artIds = makeIdFactory('art');
      const diagIds = makeIdFactory('diag');

      let value: unknown;
      try {
        value = JSON.parse(input.raw);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          artifacts: [],
          diagnostics: [
            makeDiagnostic(
              diagIds(),
              'error',
              YAML_DIAGNOSTIC_CODES.syntaxError,
              `invalid JSON: ${message}`,
            ),
          ],
        };
      }

      const document: YamlDocument = {
        documents: [
          { data: toJsonSafe(value), hasAnchors: false, hasAliases: false, anchorNames: [] },
        ],
        multiDocument: false,
      };
      const artifact: YamlDocumentArtifact = {
        version: 1,
        kind: YAML_KIND_DOCUMENT,
        id: artIds(),
        producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
        producedAt: deps.clock.now(),
        source: input.source,
        value: document,
      };
      return { artifacts: [artifact], diagnostics: [] };
    },
  };
}
