import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { GITIGNORE_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import { classifyLine, compileRule, testPaths, type CompiledRule, type IgnoreRule } from './gitignore.js';
import {
  GITIGNORE_KIND_PARSED,
  type GitignoreArtifact,
  type GitignoreParsedArtifact,
  type GitignoreReport,
} from './kinds.js';

const TOOL_ID = 'gitignore';
const PARSER_ID = 'gitignore.text';

export interface GitignoreTextParserDeps {
  readonly clock: Clock;
}

function resolvePaths(hints: ParserInput['hints']): string[] {
  const raw = hints?.paths;
  if (typeof raw !== 'string') return [];
  return raw.split(/\r?\n/).map((p) => p.trim()).filter((p) => p !== '');
}

/**
 * The `gitignore.text` parser. Classifies each line of a .gitignore and,
 * when `hints.paths` is supplied, decides whether each path is ignored
 * (last matching rule wins; `!` re-includes). Never throws; no filesystem.
 */
export function createGitignoreTextParser(deps: GitignoreTextParserDeps): Parser<GitignoreArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [GITIGNORE_KIND_PARSED],
    parse(input: ParserInput): ParserResult<GitignoreArtifact> {
      return parseGitignore(input, deps.clock.now());
    },
  };
}

function parseGitignore(input: ParserInput, producedAt: string): ParserResult<GitignoreArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];
  const paths = resolvePaths(input.hints);

  if (input.raw.trim() === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', GITIGNORE_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return {
      artifacts: [
        makeArtifact(artIds(), producedAt, input, { rules: [], patternCount: 0, commentCount: 0, paths: [] }),
      ],
      diagnostics,
    };
  }

  const lines = input.raw.split(/\r?\n/);
  const rules: IgnoreRule[] = lines.map((line, i) => classifyLine(line, i + 1));

  const compiled: CompiledRule[] = [];
  for (const rule of rules) {
    const c = compileRule(rule);
    if (c !== null) compiled.push(c);
  }

  // Duplicate-pattern detection (info), first-appearance order.
  const seen = new Map<string, number>();
  for (const rule of rules) {
    if (rule.pattern === null) continue;
    const key = `${rule.negated ? '!' : ''}${rule.pattern}${rule.dirOnly ? '/' : ''}`;
    if (seen.has(key)) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'info',
          GITIGNORE_DIAGNOSTIC_CODES.duplicate,
          `pattern "${key}" on line ${rule.lineNo} also appears on line ${seen.get(key)}`,
        ),
      );
    } else {
      seen.set(key, rule.lineNo);
    }
  }

  const patternCount = rules.filter((r) => r.pattern !== null).length;
  const commentCount = rules.filter((r) => r.comment).length;
  const pathResults = paths.length > 0 ? testPaths(compiled, paths) : [];

  const report: GitignoreReport = { rules, patternCount, commentCount, paths: pathResults };
  return { artifacts: [makeArtifact(artIds(), producedAt, input, report)], diagnostics };
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: GitignoreReport,
): GitignoreParsedArtifact {
  return {
    version: 1,
    kind: GITIGNORE_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
