/**
 * Self-contained .gitignore core: classify a pattern line and compile it to
 * a RegExp approximating Git's matching semantics (anchoring, directory-only,
 * `*` / `**` / `?` / character classes). No dependencies, no network.
 *
 * This is a pragmatic subset — good for the common cases a developer tests
 * interactively, not a bit-exact reimplementation of Git's pathspec engine.
 */

export interface IgnoreRule {
  readonly lineNo: number;
  readonly raw: string;
  /** The cleaned pattern (negation/anchor markers removed), or null for blank/comment. */
  readonly pattern: string | null;
  readonly negated: boolean;
  readonly dirOnly: boolean;
  /** True when the pattern is anchored to the gitignore's directory. */
  readonly anchored: boolean;
  readonly comment: boolean;
  readonly blank: boolean;
}

export interface CompiledRule {
  readonly rule: IgnoreRule;
  readonly regex: RegExp;
}

/** Classify a single .gitignore line (1-based lineNo). */
export function classifyLine(raw: string, lineNo: number): IgnoreRule {
  const base: Omit<IgnoreRule, 'pattern' | 'negated' | 'dirOnly' | 'anchored'> = {
    lineNo,
    raw,
    comment: false,
    blank: false,
  };

  // Git trims trailing whitespace unless escaped with a backslash.
  let line = raw.replace(/\\?\s+$/, (m) => (m.startsWith('\\') ? m : ''));
  if (line.trim() === '') return { ...base, blank: true, pattern: null, negated: false, dirOnly: false, anchored: false };
  if (line.startsWith('#')) return { ...base, comment: true, pattern: null, negated: false, dirOnly: false, anchored: false };

  let negated = false;
  if (line.startsWith('!')) {
    negated = true;
    line = line.slice(1);
  } else if (line.startsWith('\\#') || line.startsWith('\\!')) {
    line = line.slice(1); // escaped leading # or !
  }

  let dirOnly = false;
  if (line.endsWith('/')) {
    dirOnly = true;
    line = line.slice(0, -1);
  }

  // Anchored if it starts with '/' or contains a non-trailing slash.
  let anchored = false;
  if (line.startsWith('/')) {
    anchored = true;
    line = line.slice(1);
  } else if (line.includes('/')) {
    anchored = true;
  }

  return { ...base, pattern: line, negated, dirOnly, anchored };
}

/** Compile a classified rule to a RegExp matching POSIX-style relative paths. */
export function compileRule(rule: IgnoreRule): CompiledRule | null {
  if (rule.pattern === null) return null;
  const body = translateGlob(rule.pattern);
  const prefix = rule.anchored ? '^' : '^(?:.*/)?';
  // A match also ignores everything beneath a matched directory.
  const suffix = '(?:/.*)?$';
  return { rule, regex: new RegExp(prefix + body + suffix) };
}

function translateGlob(pattern: string): string {
  let out = '';
  let i = 0;
  while (i < pattern.length) {
    if (pattern.startsWith('**/', i)) {
      out += '(?:.*/)?';
      i += 3;
      continue;
    }
    if (pattern.startsWith('**', i)) {
      out += '.*';
      i += 2;
      continue;
    }
    const c = pattern[i]!;
    if (c === '*') {
      out += '[^/]*';
    } else if (c === '?') {
      out += '[^/]';
    } else if (c === '[') {
      const close = pattern.indexOf(']', i + 1);
      if (close < 0) {
        out += '\\[';
      } else {
        let cls = pattern.slice(i + 1, close);
        if (cls.startsWith('!')) cls = `^${cls.slice(1)}`;
        out += `[${cls}]`;
        i = close + 1;
        continue;
      }
    } else if ('.\\+(){}^$|'.includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
    i += 1;
  }
  return out;
}

export interface PathResult {
  readonly path: string;
  readonly ignored: boolean;
  /** Line number of the last rule that decided the outcome, or null if unmatched. */
  readonly matchedBy: number | null;
}

/** Decide whether each path is ignored: last matching rule wins; `!` re-includes. */
export function testPaths(compiled: readonly CompiledRule[], paths: readonly string[]): PathResult[] {
  return paths.map((rawPath) => {
    const path = rawPath.replace(/^\.?\//, '').replace(/\/+$/, '');
    let ignored = false;
    let matchedBy: number | null = null;
    for (const { rule, regex } of compiled) {
      if (regex.test(path)) {
        ignored = !rule.negated;
        matchedBy = rule.lineNo;
      }
    }
    return { path, ignored, matchedBy };
  });
}
