import type { Parser, ParserInput, ParserResult } from '@nekotools/contracts';

import { canonicalize } from './canonical.js';
import { ENV_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  ENV_KIND_DIFF,
  type EnvArtifact,
  type EnvDiff,
  type EnvDiffArtifact,
  type EnvDiffHunk,
  type EnvDocument,
} from './kinds.js';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

const TOOL_ID = 'env';
const PARSER_ID = 'env.diff.textual';

interface ParserDeps {
  readonly clock: Clock;
}

/**
 * Phase 2.1 `env.diff.textual` parser. Parallel to NekoJSON's Phase
 * 1.1a `json.diff.textual`. Implemented as a Parser (not a separate
 * contract) for the same reason `env.key` is: it produces an artifact
 * from user-initiated input plus hints, which is what Parser is for.
 * If a third "transform N artifacts into one" tool appears, the right
 * move is to extract a Transformer contract — two examples is not
 * enough yet.
 *
 * `input.raw` is unused (kept as `""` by convention); both source
 * documents and their artifact ids are passed through `input.hints`.
 * Source is recorded as `kind: 'derived'` so lineage is honest.
 *
 * Structural / key-level diff is Pro (`diff.structural`); this parser
 * does **not** attempt it.
 */
export function createEnvDiffTextualParser(deps: ParserDeps): Parser<EnvArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['env.diff.textual'],
    produces: [ENV_KIND_DIFF],
    parse(input: ParserInput): ParserResult<EnvArtifact> {
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
              ENV_DIAGNOSTIC_CODES.diffMissingInput,
              'textual diff requires hints.leftArtifactId and hints.rightArtifactId',
            ),
          ],
        };
      }

      const hasLeft = Object.prototype.hasOwnProperty.call(hints, 'leftDocument');
      const hasRight = Object.prototype.hasOwnProperty.call(hints, 'rightDocument');
      if (!hasLeft || !hasRight) {
        return {
          artifacts: [],
          diagnostics: [
            makeDiagnostic(
              diagIds(),
              'error',
              ENV_DIAGNOSTIC_CODES.diffMissingInput,
              'textual diff requires hints.leftDocument and hints.rightDocument',
            ),
          ],
        };
      }

      const left = hints['leftDocument'] as EnvDocument | undefined;
      const right = hints['rightDocument'] as EnvDocument | undefined;
      if (!isEnvDocumentLike(left) || !isEnvDocumentLike(right)) {
        return {
          artifacts: [],
          diagnostics: [
            makeDiagnostic(
              diagIds(),
              'error',
              ENV_DIAGNOSTIC_CODES.diffMissingInput,
              'textual diff requires hints.leftDocument and hints.rightDocument to be EnvDocument-shaped objects',
            ),
          ],
        };
      }

      const diff: EnvDiff = computeTextualDiff(leftId, rightId, left, right);

      const artifact: EnvDiffArtifact = {
        version: 1,
        kind: ENV_KIND_DIFF,
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

function isEnvDocumentLike(v: unknown): v is EnvDocument {
  if (v === null || typeof v !== 'object') return false;
  const d = v as { entries?: unknown; lines?: unknown };
  return Array.isArray(d.entries) && Array.isArray(d.lines);
}

/**
 * Compute a line-level diff against the canonical sorted re-emit of
 * each document. Exported so callers with two `EnvDocument`s in hand
 * can diff directly without going through the parser dispatch —
 * useful for unit tests.
 */
export function computeTextualDiff(
  leftArtifactId: string,
  rightArtifactId: string,
  leftDoc: EnvDocument,
  rightDoc: EnvDocument,
): EnvDiff {
  const leftLines = canonicalize(leftDoc, 'sorted').split('\n');
  const rightLines = canonicalize(rightDoc, 'sorted').split('\n');
  const hunks = diffLines(leftLines, rightLines);
  return { leftArtifactId, rightArtifactId, hunks };
}

/**
 * LCS-backed line diff. Identical shape to NekoJSON's
 * `diffLines` — duplicated rather than extracted because two
 * occurrences is not enough to motivate a shared algorithm package.
 */
export function diffLines(
  a: readonly string[],
  b: readonly string[],
): readonly EnvDiffHunk[] {
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

  const hunks: EnvDiffHunk[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      hunks.push({ kind: 'equal', text: a[i - 1] ?? '', leftLine: i, rightLine: j });
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
