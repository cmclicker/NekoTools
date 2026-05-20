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
import {
  findFirstErrorToken,
  findTokenAt,
  tokenize,
  type JsonTokenSpan,
} from './tokenizer.js';
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
        const span = resolveSyntaxErrorSpan(input.raw, message);
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
      //
      // Size is measured as the UTF-8 *byte* length of `input.raw`,
      // not its UTF-16 code-unit length. The public name of the
      // threshold (`*Bytes`, "10 MB") is then accurate for non-ASCII
      // payloads. `TextEncoder` is a global in Node 16+ and modern
      // browsers — no new dependency.
      const diagnostics: Diagnostic[] = [];
      const threshold = deps.largeDocumentBytes ?? DEFAULT_LARGE_DOCUMENT_BYTES;
      const actualBytes = utf8ByteLength(input.raw);
      if (actualBytes > threshold) {
        diagnostics.push(
          makeDiagnostic(
            diagIds(),
            'info',
            JSON_DIAGNOSTIC_CODES.largeDocument,
            `document is ${actualBytes} bytes; exceeds soft threshold of ${threshold} bytes — some heavy operations may be gated`,
          ),
        );
      }

      return { artifacts: [artifact], diagnostics };
    },
  };
}

/**
 * UTF-8 byte length of a string. Used by the large-document threshold
 * so the "*Bytes" naming is honest for non-ASCII payloads (a `é`
 * contributes 2 bytes but only 1 UTF-16 code unit).
 *
 * `TextEncoder` is a global in Node 16+ and every modern browser; no
 * new dependency. A single shared encoder avoids per-call allocation.
 */
const SHARED_UTF8_ENCODER = new TextEncoder();
function utf8ByteLength(s: string): number {
  return SHARED_UTF8_ENCODER.encode(s).byteLength;
}

/**
 * Phase 1.1c: derive a span for a `json.syntax_error` diagnostic by
 * consulting the in-tree tokenizer.
 *
 * Resolution order:
 *   1. If the tokenizer found a lexical error token (unterminated
 *      string, malformed number, invalid escape, unexpected char),
 *      use its span — those are the *exact* source ranges that broke
 *      `JSON.parse`.
 *   2. Otherwise the input was lexically clean but structurally broken
 *      (e.g. `{"a"}` — JSON.parse complains about `}` because it
 *      wants `:`). Try to pull a `position N` out of the V8 error
 *      message, then find the *token* containing that position and
 *      use that token's span. This produces a multi-character
 *      highlight instead of the single-char span the regex alone gave
 *      us in Phase 1.0.
 *   3. As a last resort, fall back to the one-character span at the
 *      position the message reported. `undefined` is returned only if
 *      no position info is available at all.
 */
function resolveSyntaxErrorSpan(
  raw: string,
  message: string,
): JsonTokenSpan | { startOffset: number; endOffset: number } | undefined {
  const tokens = tokenize(raw);

  const firstError = findFirstErrorToken(tokens);
  if (firstError) return firstError.span;

  const positionMatch = /position\s+(\d+)/i.exec(message);
  if (!positionMatch) return undefined;
  const offset = Number(positionMatch[1]);
  if (!Number.isFinite(offset) || offset < 0) return undefined;
  const clamped = Math.min(offset, raw.length);

  const containing = findTokenAt(tokens, clamped);
  if (containing) return containing.span;

  return { startOffset: clamped, endOffset: Math.min(clamped + 1, raw.length) };
}
