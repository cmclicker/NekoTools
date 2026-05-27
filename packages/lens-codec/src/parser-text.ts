import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import {
  isCodecName,
  isCodecOperation,
  runTransform,
  type CodecName,
  type CodecOperation,
} from './codecs.js';
import {
  CODEC_DIAGNOSTIC_CODES,
  DEFAULT_LARGE_DOCUMENT_BYTES,
  errorCodeToDiagnostic,
  makeDiagnostic,
} from './diagnostics.js';
import {
  CODEC_KIND_TRANSFORM,
  type CodecArtifact,
  type CodecTransform,
  type CodecTransformArtifact,
} from './kinds.js';

const TOOL_ID = 'codec';
const PARSER_ID = 'codec.transform';

export interface CodecTransformParserDeps {
  readonly clock: Clock;
  /** Soft byte threshold for `codec.large_document`. Defaults to 10 MB. */
  readonly largeDocumentBytes?: number;
  /** Operation used when the request omits an `operation` hint. Default 'encode'. */
  readonly defaultOperation?: CodecOperation;
  /** Codec used when the request omits a `codec` hint. Default 'base64'. */
  readonly defaultCodec?: CodecName;
}

/**
 * The `codec.transform` parser. The operation (encode / decode) and codec
 * (base64 / base64url / url / hex) are selected via `input.hints`
 * (`{ operation, codec }`); unknown or missing hints fall back to the
 * registration defaults. Always produces exactly one `codec.transform`
 * artifact — even on invalid input, where `output` is null and an error
 * diagnostic explains why — and never throws.
 */
export function createCodecTransformParser(
  deps: CodecTransformParserDeps,
): Parser<CodecArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [CODEC_KIND_TRANSFORM],
    parse(input: ParserInput): ParserResult<CodecArtifact> {
      return parseCodec(input, deps);
    },
  };
}

const SHARED_UTF8_ENCODER = new TextEncoder();
function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

function pickOperation(
  hints: ParserInput['hints'],
  deps: CodecTransformParserDeps,
): CodecOperation {
  const hint = hints?.['operation'];
  if (isCodecOperation(hint)) return hint;
  return deps.defaultOperation ?? 'encode';
}

function pickCodec(hints: ParserInput['hints'], deps: CodecTransformParserDeps): CodecName {
  const hint = hints?.['codec'];
  if (isCodecName(hint)) return hint;
  return deps.defaultCodec ?? 'base64';
}

function parseCodec(
  input: ParserInput,
  deps: CodecTransformParserDeps,
): ParserResult<CodecArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  const operation = pickOperation(input.hints, deps);
  const codec = pickCodec(input.hints, deps);
  const raw = input.raw;
  const inputBytes = utf8ByteLength(raw);

  if (raw.length === 0) {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', CODEC_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
  }

  const threshold = deps.largeDocumentBytes ?? DEFAULT_LARGE_DOCUMENT_BYTES;
  if (inputBytes > threshold) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        CODEC_DIAGNOSTIC_CODES.largeDocument,
        `input is ${inputBytes} bytes; exceeds soft threshold of ${threshold} bytes`,
      ),
    );
  }

  const outcome = runTransform(operation, codec, raw);

  if (!outcome.ok && outcome.errorCode !== null) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'error',
        errorCodeToDiagnostic(outcome.errorCode),
        outcome.errorMessage ?? 'input is not valid for the selected codec',
      ),
    );
  }

  if (outcome.ok && outcome.looksBinary) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'warning',
        CODEC_DIAGNOSTIC_CODES.binaryOutput,
        'decoded output looks binary (contains NUL / control bytes); shown as best-effort text',
      ),
    );
  }

  const output = outcome.output;
  const transform: CodecTransform = {
    operation,
    codec,
    input: raw,
    output,
    ok: outcome.ok,
    inputBytes,
    outputBytes: output === null ? 0 : utf8ByteLength(output),
    looksBinary: outcome.looksBinary,
  };

  const artifact: CodecTransformArtifact = {
    version: 1,
    kind: CODEC_KIND_TRANSFORM,
    id: artIds(),
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt: deps.clock.now(),
    source: input.source,
    value: transform,
  };

  return { artifacts: [artifact], diagnostics };
}
