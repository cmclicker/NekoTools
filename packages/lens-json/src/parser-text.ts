import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';

import {
  DEFAULT_LARGE_DOCUMENT_BYTES,
  JSON_DIAGNOSTIC_CODES,
  makeDiagnostic,
} from './diagnostics.js';
import {
  JSON_KIND_DOCUMENT,
  type JsonArtifact,
  type JsonDocumentArtifact,
} from './kinds.js';
import { makeIdFactory, type Clock } from './util.js';

const TOOL_ID = 'json';
const PARSER_ID = 'json.text';

interface ParserDeps {
  readonly clock: Clock;
  /**
   * Soft size threshold for emitting `json.large_document`. Defaults
   * to `DEFAULT_LARGE_DOCUMENT_BYTES` (10 MB). Tests inject a small
   * value so they do not have to allocate megabytes of input.
   */
  readonly largeDocumentBytes?: number;
}

/**
 * Phase 1 MVP: wraps `JSON.parse` and emits a structured diagnostic on
 * failure. When V8 / Node attaches a `at position N` to the error
 * message, we extract it into a span so the UI can highlight the
 * offending byte. When that information is absent (older Node, weird
 * messages), the diagnostic is still emitted — just without a span.
 *
 * A real tokenizer that always produces accurate spans is deferred (see
 * docs/tools/nekojson.md "Deliberately undecided in Phase 1").
 */
export function createJsonTextParser(deps: ParserDeps): Parser<JsonArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text', 'json'],
    produces: [JSON_KIND_DOCUMENT],
    parse(input: ParserInput): ParserResult<JsonArtifact> {
      const artIds = makeIdFactory('art');
      const diagIds = makeIdFactory('diag');

      if (input.raw.trim() === '') {
        return {
          artifacts: [],
          diagnostics: [
            makeDiagnostic(
              diagIds(),
              'error',
              JSON_DIAGNOSTIC_CODES.emptyInput,
              'input is empty',
            ),
          ],
        };
      }

      let value: unknown;
      try {
        value = JSON.parse(input.raw);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const span = extractPositionSpan(message, input.raw.length);
        return {
          artifacts: [],
          diagnostics: [
            makeDiagnostic(
              diagIds(),
              'error',
              JSON_DIAGNOSTIC_CODES.syntaxError,
              message,
              span,
            ),
          ],
        };
      }

      const artifact: JsonDocumentArtifact = {
        version: 1,
        kind: JSON_KIND_DOCUMENT,
        id: artIds(),
        producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
        producedAt: deps.clock.now(),
        source: input.source,
        value,
      };

      // Soft-threshold info diagnostic. Emitted *alongside* the
      // artifact — large input is not an error, just a heads-up that
      // downstream operations may be slow. Heavy Pro projections in
      // Phase 3 will read this diagnostic to gate themselves.
      const diagnostics: Diagnostic[] = [];
      const threshold = deps.largeDocumentBytes ?? DEFAULT_LARGE_DOCUMENT_BYTES;
      if (input.raw.length > threshold) {
        diagnostics.push(
          makeDiagnostic(
            diagIds(),
            'info',
            JSON_DIAGNOSTIC_CODES.largeDocument,
            `document is ${input.raw.length} bytes; exceeds soft threshold of ${threshold} bytes — some heavy operations may be gated`,
          ),
        );
      }

      return { artifacts: [artifact], diagnostics };
    },
  };
}

/**
 * Best-effort extraction of a byte offset from a JSON.parse error message.
 * V8 historically emits "Unexpected token ... in JSON at position 42" or
 * (Node 21+) "Unexpected token ... is not valid JSON". The regex is
 * intentionally permissive: any failure returns `undefined` and the
 * diagnostic carries no span.
 */
function extractPositionSpan(
  message: string,
  inputLength: number,
): { startOffset: number; endOffset: number } | undefined {
  const match = /position\s+(\d+)/i.exec(message);
  if (!match) return undefined;
  const offset = Number(match[1]);
  if (!Number.isFinite(offset) || offset < 0) return undefined;
  const clamped = Math.min(offset, inputLength);
  return { startOffset: clamped, endOffset: Math.min(clamped + 1, inputLength) };
}
