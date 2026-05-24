import type { Parser, ParserInput, ParserResult } from '@nekotools/contracts';

import { ENV_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  ENV_KIND_KEY_RESULT,
  type EnvArtifact,
  type EnvDocument,
  type EnvKeyResultArtifact,
} from './kinds.js';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

const TOOL_ID = 'env';
const PARSER_ID = 'env.key';

interface ParserDeps {
  readonly clock: Clock;
}

/**
 * Resolves a single dotenv key against a target `env.document`.
 *
 * Parallel to NekoJSON's `json.pointer`: the key text is `input.raw`,
 * and the target document is passed via `input.hints.document` (an
 * `EnvDocument`) with `input.hints.documentArtifactId` for lineage.
 *
 * If the document has duplicate keys, the **last** occurrence wins —
 * matching the canonical dotenv loader behavior. The duplicate-key
 * warning is emitted by the text parser when it builds the document,
 * not here.
 */
export function createEnvKeyParser(deps: ParserDeps): Parser<EnvArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['env-key'],
    produces: [ENV_KIND_KEY_RESULT],
    parse(input: ParserInput): ParserResult<EnvArtifact> {
      const artIds = makeIdFactory('art');
      const diagIds = makeIdFactory('diag');

      const documentArtifactId =
        typeof input.hints?.['documentArtifactId'] === 'string'
          ? (input.hints['documentArtifactId'] as string)
          : 'unknown';
      const document = input.hints?.['document'] as EnvDocument | undefined;

      const key = input.raw;
      if (!document || !Array.isArray(document.entries)) {
        const artifact: EnvKeyResultArtifact = {
          version: 1,
          kind: ENV_KIND_KEY_RESULT,
          id: artIds(),
          producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
          producedAt: deps.clock.now(),
          source: input.source,
          value: { key, documentArtifactId, present: false },
        };
        return {
          artifacts: [artifact],
          diagnostics: [
            makeDiagnostic(
              diagIds(),
              'error',
              ENV_DIAGNOSTIC_CODES.keyNotFound,
              `env.key requires hints.document; none provided`,
            ),
          ],
        };
      }

      // Last occurrence wins. We iterate from the end so the first
      // match is the effective entry without scanning the whole list.
      let found: EnvDocument['entries'][number] | undefined;
      for (let i = document.entries.length - 1; i >= 0; i -= 1) {
        const e = document.entries[i]!;
        if (e.key === key) {
          found = e;
          break;
        }
      }

      if (!found) {
        const artifact: EnvKeyResultArtifact = {
          version: 1,
          kind: ENV_KIND_KEY_RESULT,
          id: artIds(),
          producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
          producedAt: deps.clock.now(),
          source: input.source,
          value: { key, documentArtifactId, present: false },
        };
        return {
          artifacts: [artifact],
          diagnostics: [
            makeDiagnostic(
              diagIds(),
              'error',
              ENV_DIAGNOSTIC_CODES.keyNotFound,
              `key "${key}" not found in document`,
            ),
          ],
        };
      }

      const artifact: EnvKeyResultArtifact = {
        version: 1,
        kind: ENV_KIND_KEY_RESULT,
        id: artIds(),
        producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
        producedAt: deps.clock.now(),
        source: input.source,
        value: { key, documentArtifactId, present: true, entry: found },
      };
      return { artifacts: [artifact], diagnostics: [] };
    },
  };
}
