import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import {
  DEFAULT_LARGE_INPUT_BYTES,
  DIFF_DIAGNOSTIC_CODES,
  looksBinary,
  makeDiagnostic,
  utf8ByteLength,
} from './diagnostics.js';
import {
  DIFF_KIND_RESULT,
  type DiffArtifact,
  type DiffHunk,
  type DiffMode,
  type DiffResult,
  type DiffResultArtifact,
  type DiffSummary,
} from './kinds.js';
import { computeLineDiff, summarize, toLines } from './line-diff.js';
import { normalizeJson, normalizeYaml } from './normalize.js';

const TOOL_ID = 'diff';

export interface DiffParserDeps {
  readonly clock: Clock;
  /** Soft per-side byte threshold for `diff.large_input`. Defaults to 10 MB. */
  readonly largeInputBytes?: number;
}

interface SideInput {
  readonly label: string;
  readonly raw: string;
}

/** A side reduced to comparable lines, plus any parse diagnostics it raised.
 * `lines` is null when the side could not be reduced (parse failure). */
interface PreparedSide {
  readonly lines: readonly string[] | null;
  readonly diagnostics: readonly Diagnostic[];
}

type Preparer = (side: SideInput, diagId: () => string) => PreparedSide;

const EMPTY_SUMMARY: DiffSummary = {
  added: 0,
  removed: 0,
  unchanged: 0,
  changed: 0,
  identical: false,
};

/**
 * Build a NekoDiff parser for one compare mode. All three modes share the
 * same envelope: read both sides from `hints`, run the cross-cutting
 * diagnostics (empty / large / binary), reduce each side to comparable
 * lines via `prepare`, then LCS-diff. `input.raw` is unused by convention —
 * the two sides arrive through `input.hints`, exactly like NekoJSON's
 * textual diff — and the artifact's source is `derived` so its lineage is
 * honest (this result was computed from two inputs, not pasted or imported).
 *
 * NekoDiff is the third tool with this "transform N inputs into one new
 * artifact" shape (after `json.diff.textual` and `env.diff.textual`). The
 * follow-up to a Transformer contract in @nekotools/contracts is tracked
 * separately; this slice deliberately stays inside the existing Parser
 * contract rather than widen the shared contracts package.
 */
function buildDiffParser(
  parserId: string,
  mode: DiffMode,
  prepare: Preparer,
  deps: DiffParserDeps,
): Parser<DiffArtifact> {
  return {
    version: 1,
    id: parserId,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: [parserId],
    produces: [DIFF_KIND_RESULT],
    parse(input: ParserInput): ParserResult<DiffArtifact> {
      const artIds = makeIdFactory('art');
      const srcIds = makeIdFactory('src');
      const diagIds = makeIdFactory('diag');
      const diagnostics: Diagnostic[] = [];

      const hints = input.hints ?? {};
      const leftText = hints['leftText'];
      const rightText = hints['rightText'];
      if (typeof leftText !== 'string' || typeof rightText !== 'string') {
        return {
          artifacts: [],
          diagnostics: [
            makeDiagnostic(
              diagIds(),
              'error',
              DIFF_DIAGNOSTIC_CODES.missingInput,
              'diff requires hints.leftText and hints.rightText to be strings',
            ),
          ],
        };
      }

      const rawLeftLabel = hints['leftLabel'];
      const rawRightLabel = hints['rightLabel'];
      const leftLabel = typeof rawLeftLabel === 'string' ? rawLeftLabel : 'Left';
      const rightLabel = typeof rawRightLabel === 'string' ? rawRightLabel : 'Right';
      const left: SideInput = { label: leftLabel, raw: leftText };
      const right: SideInput = { label: rightLabel, raw: rightText };

      const threshold = deps.largeInputBytes ?? DEFAULT_LARGE_INPUT_BYTES;

      // Cross-cutting, mode-independent diagnostics over the raw sides.
      for (const side of [left, right]) {
        if (side.raw.trim() === '') {
          diagnostics.push(
            makeDiagnostic(
              diagIds(),
              'info',
              DIFF_DIAGNOSTIC_CODES.emptyInput,
              `${side.label} side is empty`,
            ),
          );
        }
        const bytes = utf8ByteLength(side.raw);
        if (bytes > threshold) {
          diagnostics.push(
            makeDiagnostic(
              diagIds(),
              'info',
              DIFF_DIAGNOSTIC_CODES.largeInput,
              `${side.label} side is ${bytes} bytes; exceeds soft threshold of ${threshold} bytes`,
            ),
          );
        }
        if (looksBinary(side.raw)) {
          diagnostics.push(
            makeDiagnostic(
              diagIds(),
              'warning',
              DIFF_DIAGNOSTIC_CODES.binaryInput,
              `${side.label} side looks binary (contains a NUL byte); the diff may be meaningless`,
            ),
          );
        }
      }

      const preparedLeft = prepare(left, diagIds);
      const preparedRight = prepare(right, diagIds);
      diagnostics.push(...preparedLeft.diagnostics, ...preparedRight.diagnostics);

      const comparable = preparedLeft.lines !== null && preparedRight.lines !== null;

      let hunks: readonly DiffHunk[] = [];
      let summary: DiffSummary = EMPTY_SUMMARY;
      if (preparedLeft.lines !== null && preparedRight.lines !== null) {
        hunks = computeLineDiff(preparedLeft.lines, preparedRight.lines);
        summary = summarize(hunks);
        if (summary.identical) {
          diagnostics.push(
            makeDiagnostic(
              diagIds(),
              'info',
              DIFF_DIAGNOSTIC_CODES.identical,
              mode === 'text'
                ? 'the two inputs are identical'
                : `the two inputs are identical under normalized ${mode.toUpperCase()} comparison`,
            ),
          );
        }
      }

      const value: DiffResult = {
        mode,
        leftLabel,
        rightLabel,
        hunks,
        summary,
        comparable,
      };

      const artifact: DiffResultArtifact = {
        version: 1,
        kind: DIFF_KIND_RESULT,
        id: artIds(),
        producedBy: { toolId: TOOL_ID, parserId, parserVersion: 1 },
        producedAt: deps.clock.now(),
        source: { kind: 'derived', from: [srcIds(), srcIds()] },
        value,
      };

      return { artifacts: [artifact], diagnostics };
    },
  };
}

/** Text mode: compare the raw inputs line-by-line, no preprocessing. */
const prepareText: Preparer = (side) => ({ lines: toLines(side.raw), diagnostics: [] });

/** JSON mode: parse + canonicalize each side; a parse failure is reported. */
const prepareJson: Preparer = (side, diagId) => {
  if (side.raw.trim() === '') {
    // Nothing to parse; compare as zero lines (the empty-input diagnostic
    // already fired in the envelope).
    return { lines: [], diagnostics: [] };
  }
  const { normalized, error } = normalizeJson(side.raw);
  if (normalized === null) {
    return {
      lines: null,
      diagnostics: [
        makeDiagnostic(
          diagId(),
          'error',
          DIFF_DIAGNOSTIC_CODES.parseError,
          `${side.label} side is not valid JSON: ${error ?? 'parse error'}`,
        ),
      ],
    };
  }
  return { lines: toLines(normalized), diagnostics: [] };
};

/** YAML mode: parse + normalize each side via lens-yaml; failures reported. */
const prepareYaml: Preparer = (side, diagId) => {
  if (side.raw.trim() === '') {
    return { lines: [], diagnostics: [] };
  }
  const { normalized, error } = normalizeYaml(side.raw);
  if (normalized === null) {
    return {
      lines: null,
      diagnostics: [
        makeDiagnostic(
          diagId(),
          'error',
          DIFF_DIAGNOSTIC_CODES.parseError,
          `${side.label} side is not valid YAML: ${error ?? 'parse error'}`,
        ),
      ],
    };
  }
  return { lines: toLines(normalized), diagnostics: [] };
};

/** The raw line-by-line text-diff parser (`diff.text`). */
export function createDiffTextParser(deps: DiffParserDeps): Parser<DiffArtifact> {
  return buildDiffParser('diff.text', 'text', prepareText, deps);
}

/** The JSON-aware diff parser (`diff.json`) — canonical-form comparison. */
export function createDiffJsonParser(deps: DiffParserDeps): Parser<DiffArtifact> {
  return buildDiffParser('diff.json', 'json', prepareJson, deps);
}

/** The YAML-aware diff parser (`diff.yaml`) — normalized-YAML comparison. */
export function createDiffYamlParser(deps: DiffParserDeps): Parser<DiffArtifact> {
  return buildDiffParser('diff.yaml', 'yaml', prepareYaml, deps);
}
