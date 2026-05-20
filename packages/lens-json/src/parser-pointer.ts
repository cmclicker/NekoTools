import type { Parser, ParserInput, ParserResult } from '@nekotools/contracts';

import { JSON_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  JSON_KIND_PATH_RESULT,
  type JsonArtifact,
  type JsonPathResultArtifact,
} from './kinds.js';
import { makeIdFactory, type Clock } from './util.js';

const TOOL_ID = 'json';
const PARSER_ID = 'json.pointer';

interface ParserDeps {
  readonly clock: Clock;
}

/**
 * Resolves a JSON Pointer (RFC 6901) against a target document.
 *
 * The pointer text is `input.raw`. The document to resolve against is
 * passed through `input.hints.document` (an unknown value tree) and
 * `input.hints.documentArtifactId` (the id to record on the result).
 * Phase 1 takes the hint route rather than introducing a new contract
 * shape; if it generalizes across tools, a follow-up extracts a proper
 * "context artifact" mechanism.
 */
export function createJsonPointerParser(deps: ParserDeps): Parser<JsonArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['pointer', 'json-pointer'],
    produces: [JSON_KIND_PATH_RESULT],
    parse(input: ParserInput): ParserResult<JsonArtifact> {
      const artIds = makeIdFactory('art');
      const diagIds = makeIdFactory('diag');

      const documentArtifactId =
        typeof input.hints?.['documentArtifactId'] === 'string'
          ? (input.hints['documentArtifactId'] as string)
          : 'unknown';
      const document = input.hints?.['document'];

      const pointer = input.raw;
      const tokensResult = parsePointer(pointer);
      if (!tokensResult.ok) {
        return {
          artifacts: [],
          diagnostics: [
            makeDiagnostic(
              diagIds(),
              'error',
              JSON_DIAGNOSTIC_CODES.pointerInvalid,
              tokensResult.error,
              undefined,
              'see RFC 6901 — pointer must be empty or start with "/"',
            ),
          ],
        };
      }

      const resolveResult = resolveTokens(document, tokensResult.tokens);

      const artifact: JsonPathResultArtifact = {
        version: 1,
        kind: JSON_KIND_PATH_RESULT,
        id: artIds(),
        producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
        producedAt: deps.clock.now(),
        source: input.source,
        value: {
          pointer,
          documentArtifactId,
          resolved: resolveResult.ok,
          value: resolveResult.ok ? resolveResult.value : null,
        },
      };

      const diagnostics = resolveResult.ok
        ? []
        : [
            makeDiagnostic(
              diagIds(),
              'error',
              JSON_DIAGNOSTIC_CODES.pointerUnresolved,
              `pointer "${pointer}" did not resolve: ${resolveResult.error}`,
            ),
          ];

      return { artifacts: [artifact], diagnostics };
    },
  };
}

interface PointerOk {
  readonly ok: true;
  readonly tokens: readonly string[];
}
interface PointerErr {
  readonly ok: false;
  readonly error: string;
}
type PointerResult = PointerOk | PointerErr;

export function parsePointer(pointer: string): PointerResult {
  if (pointer === '') return { ok: true, tokens: [] };
  if (!pointer.startsWith('/')) {
    return { ok: false, error: `pointer must start with "/" (got "${pointer}")` };
  }
  const parts = pointer.slice(1).split('/');
  const tokens = parts.map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  return { ok: true, tokens };
}

interface ResolveOk {
  readonly ok: true;
  readonly value: unknown;
}
interface ResolveErr {
  readonly ok: false;
  readonly error: string;
}
type ResolveResult = ResolveOk | ResolveErr;

function resolveTokens(root: unknown, tokens: readonly string[]): ResolveResult {
  let current: unknown = root;
  for (const token of tokens) {
    if (current === null || current === undefined) {
      return { ok: false, error: `cannot descend into null/undefined at "${token}"` };
    }
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(token)) {
        return {
          ok: false,
          error: `array requires non-negative integer index, got "${token}"`,
        };
      }
      const idx = Number(token);
      if (idx >= current.length) {
        return { ok: false, error: `array index ${idx} out of bounds` };
      }
      current = current[idx];
      continue;
    }
    if (typeof current === 'object') {
      const obj = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(obj, token)) {
        return { ok: false, error: `key "${token}" not found` };
      }
      current = obj[token];
      continue;
    }
    return { ok: false, error: `cannot descend into ${typeof current} at "${token}"` };
  }
  return { ok: true, value: current };
}
