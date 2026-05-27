import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { utf8ByteLength } from './encoding.js';
import {
  DEFAULT_LARGE_INPUT_BYTES,
  HASH_DIAGNOSTIC_CODES,
  makeDiagnostic,
} from './diagnostics.js';
import {
  HASH_KIND_INPUT,
  type HashArtifact,
  type HashInput,
  type HashInputArtifact,
} from './kinds.js';

const TOOL_ID = 'hash';
const PARSER_ID = 'hash.text';

export interface HashTextParserDeps {
  readonly clock: Clock;
  /** Soft byte threshold for `hash.large_input`. Defaults to 10 MB. */
  readonly largeInputBytes?: number;
}

/**
 * The `hash.text` parser. Synchronously ingests raw text into a
 * `hash.input` artifact (the only part of hashing that fits the sync
 * Parser contract — the actual digest is computed asynchronously by
 * `digestBytes`). Measures the UTF-8 byte length and flags empty / large
 * input. Never throws.
 */
export function createHashTextParser(deps: HashTextParserDeps): Parser<HashArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [HASH_KIND_INPUT],
    parse(input: ParserInput): ParserResult<HashArtifact> {
      return parseHashText(input, deps);
    },
  };
}

function parseHashText(input: ParserInput, deps: HashTextParserDeps): ParserResult<HashArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  const byteLength = utf8ByteLength(input.raw);

  if (byteLength === 0) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        HASH_DIAGNOSTIC_CODES.emptyInput,
        'input is empty; the digest is the hash of zero bytes',
      ),
    );
  }

  const threshold = deps.largeInputBytes ?? DEFAULT_LARGE_INPUT_BYTES;
  if (byteLength > threshold) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        HASH_DIAGNOSTIC_CODES.largeInput,
        `input is ${byteLength} bytes; exceeds soft threshold of ${threshold} bytes`,
      ),
    );
  }

  const value: HashInput = { text: input.raw, byteLength };
  const artifact: HashInputArtifact = {
    version: 1,
    kind: HASH_KIND_INPUT,
    id: artIds(),
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt: deps.clock.now(),
    source: input.source,
    value,
  };
  return { artifacts: [artifact], diagnostics };
}
