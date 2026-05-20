import type { Parser, ParserInput, ParserResult } from '@nekotools/contracts';

import { JSON_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  JSON_KIND_DIFF,
  type JsonArtifact,
  type JsonDiff,
  type JsonDiffArtifact,
  type JsonDiffHunk,
} from './kinds.js';
import { makeIdFactory, type Clock } from './util.js';

const TOOL_ID = 'json';
const PARSER_ID = 'json.diff.textual';

interface ParserDeps {
  readonly clock: Clock;
}

/**
 * Phase 1.1a textual-diff parser.
 *
 * Implemented as a `Parser` (rather than a new contract) for the same
 * reason `json.pointer` was: it produces an artifact from
 * user-initiated input plus hints, and that's exactly what a Parser is.
 * `input.raw` is unused (kept as an empty string by convention); the
 * two source documents and their artifact ids are passed through
 * `input.hints`. Source is recorded as `kind: 'derived'` so the artifact
 * lineage is honest — this diff was not pasted or imported, it was
 * derived from two other artifacts.
 *
 * If we acquire a third tool with the same "transform N artifacts into
 * one new artifact" shape, the right move is to extract a Transformer
 * contract in `@nekotools/contracts`. Two examples is not enough yet.
 */
export function createDiffTextualParser(deps: ParserDeps): Parser<JsonArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['json.diff.textual'],
    produces: [JSON_KIND_DIFF],
    parse(input: ParserInput): ParserResult<JsonArtifact> {
      const artIds = makeIdFactory('art');
      const diagIds = makeIdFactory('diag');

      const hints = input.hints ?? {};
      const leftId = hints['leftArtifactId'];
      const rightId = hints['rightArtifactId'];
      if (typeof leftId !== 'string' || typeof rightId !== 'string') {
        return {
          artifacts: [],
          diagnostics: [
            makeDiagnostic(
              diagIds(),
              'error',
              JSON_DIAGNOSTIC_CODES.diffMissingInput,
              'textual diff requires hints.leftArtifactId and hints.rightArtifactId',
            ),
          ],
        };
      }

      const left = hints['leftDocument'];
      const right = hints['rightDocument'];

      const diff: JsonDiff = computeTextualDiff(leftId, rightId, left, right);

      const artifact: JsonDiffArtifact = {
        version: 1,
        kind: JSON_KIND_DIFF,
        id: artIds(),
        producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
        producedAt: deps.clock.now(),
        source: { kind: 'derived', from: [leftId, rightId] },
        value: diff,
      };

      return { artifacts: [artifact], diagnostics: [] };
    },
  };
}

/**
 * Compute a line-level diff between two JSON values.
 *
 * Both values are serialized to a canonical form (recursively
 * key-sorted, 2-space indented) so that reordering object keys does
 * not produce diff noise. Then a standard LCS-based line diff is run.
 *
 * Exported so callers that already have two parsed documents in hand
 * can compute a diff directly without going through the parser
 * dispatch — useful for unit tests and for non-runtime callers.
 */
export function computeTextualDiff(
  leftArtifactId: string,
  rightArtifactId: string,
  leftValue: unknown,
  rightValue: unknown,
): JsonDiff {
  const leftLines = canonicalize(leftValue).split('\n');
  const rightLines = canonicalize(rightValue).split('\n');
  const hunks = diffLines(leftLines, rightLines);
  return { leftArtifactId, rightArtifactId, hunks };
}

/**
 * Pretty-print a JSON value with recursively sorted object keys. Used
 * to define the canonical comparison form for textual diff.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = sortKeys(obj[k]);
    return out;
  }
  return value;
}

/**
 * LCS-backed line diff. Returns hunks in source order (top to bottom).
 *
 * Complexity: O(m·n) time, O(m·n) space. Fine for the document size
 * range Phase 1 targets; the soft-size threshold work in Phase 1.1b
 * will gate this if needed.
 */
export function diffLines(a: readonly string[], b: readonly string[]): readonly JsonDiffHunk[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i += 1) dp.push(new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = (dp[i - 1]?.[j - 1] ?? 0) + 1;
      } else {
        const up = dp[i - 1]?.[j] ?? 0;
        const left = dp[i]?.[j - 1] ?? 0;
        dp[i]![j] = up >= left ? up : left;
      }
    }
  }

  const hunks: JsonDiffHunk[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      hunks.push({
        kind: 'equal',
        text: a[i - 1] ?? '',
        leftLine: i,
        rightLine: j,
      });
      i -= 1;
      j -= 1;
      continue;
    }
    const up = i > 0 ? (dp[i - 1]?.[j] ?? 0) : -1;
    const left = j > 0 ? (dp[i]?.[j - 1] ?? 0) : -1;
    if (j > 0 && left >= up) {
      hunks.push({ kind: 'add', text: b[j - 1] ?? '', rightLine: j });
      j -= 1;
    } else {
      hunks.push({ kind: 'remove', text: a[i - 1] ?? '', leftLine: i });
      i -= 1;
    }
  }
  hunks.reverse();
  return hunks;
}
