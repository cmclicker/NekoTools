import type { RegexMatchSet } from './kinds.js';

/**
 * NekoRegex Pro generators. Back two of the four declared Pro exporters:
 * `regex.export.explain` (pro entitlement `explain.mode`) and
 * `regex.export.redaction.recipe` (pro entitlement `redaction.recipes`).
 *
 * The other two declared Pro ids — `regex.export.suite` (`suites.saved`)
 * and `regex.export.snapshot` (`snapshots.regression`) — require saved
 * multi-case test suites / regression baselines, but the free build sets
 * `capabilities.canSaveWorkspace: false` and a `regex.matchset` artifact
 * holds a single test run, not a suite. They depend on the future saved-
 * workspace engine and stay advertising-only (not registered).
 *
 * Both generators here are pure, deterministic functions of a parsed
 * `regex.matchset` — native tokenization only, no remote/LLM explanation
 * (matching the manifest's out-of-scope note), no eval, no network.
 */

// --- explain ---------------------------------------------------------------

interface ExplainToken {
  readonly token: string;
  readonly meaning: string;
}

/**
 * Tokenize a JS regex source into human-readable segments. Deliberately
 * structural (not a full AST): it recognises the common constructs —
 * anchors, classes, groups, quantifiers, escapes, alternation — and falls
 * back to "literal" for ordinary characters. Native parsing only.
 */
export function explainTokens(pattern: string): ExplainToken[] {
  const tokens: ExplainToken[] = [];
  const push = (token: string, meaning: string): void => {
    tokens.push({ token, meaning });
  };

  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i]!;
    const rest = pattern.slice(i);

    // Named group opener.
    const named = /^\(\?<([A-Za-z_$][\w$]*)>/.exec(rest);
    if (named) {
      push(named[0], `start of named capture group "${named[1]}"`);
      i += named[0].length;
      continue;
    }
    if (rest.startsWith('(?:')) {
      push('(?:', 'start of non-capturing group');
      i += 3;
      continue;
    }
    if (rest.startsWith('(?=')) {
      push('(?=', 'start of positive lookahead');
      i += 3;
      continue;
    }
    if (rest.startsWith('(?!')) {
      push('(?!', 'start of negative lookahead');
      i += 3;
      continue;
    }
    if (rest.startsWith('(?<=')) {
      push('(?<=', 'start of positive lookbehind');
      i += 4;
      continue;
    }
    if (rest.startsWith('(?<!')) {
      push('(?<!', 'start of negative lookbehind');
      i += 4;
      continue;
    }

    // Escapes: take the backslash + next char as one token.
    if (c === '\\' && i + 1 < pattern.length) {
      const next = pattern[i + 1]!;
      push(`\\${next}`, escapeMeaning(next));
      i += 2;
      continue;
    }

    // Quantifiers (optionally lazy).
    const quant = /^(?:[*+?]|\{\d+(?:,\d*)?\})\??/.exec(rest);
    if (quant && c !== '\\') {
      push(quant[0], quantifierMeaning(quant[0]));
      i += quant[0].length;
      continue;
    }

    switch (c) {
      case '^':
        push('^', 'anchor: start of input (or line with `m`)');
        break;
      case '$':
        push('$', 'anchor: end of input (or line with `m`)');
        break;
      case '.':
        push('.', 'any character (except newline, unless `s`)');
        break;
      case '(':
        push('(', 'start of capturing group');
        break;
      case ')':
        push(')', 'end of group');
        break;
      case '|':
        push('|', 'alternation (OR)');
        break;
      case '[': {
        const cls = /^\[\^?\]?[^\]]*\]/.exec(rest);
        if (cls) {
          const negated = cls[0].startsWith('[^');
          push(cls[0], `${negated ? 'negated ' : ''}character class`);
          i += cls[0].length;
          continue;
        }
        push('[', 'start of character class');
        break;
      }
      default:
        push(c, `literal character "${c}"`);
    }
    i += 1;
  }
  return tokens;
}

function quantifierMeaning(q: string): string {
  const lazy = q.endsWith('?') && q.length > 1 && q !== '?';
  const core = lazy ? q.slice(0, -1) : q;
  let base: string;
  switch (core) {
    case '*':
      base = 'zero or more';
      break;
    case '+':
      base = 'one or more';
      break;
    case '?':
      base = 'optional (zero or one)';
      break;
    default: {
      const m = /^\{(\d+)(?:,(\d*))?\}$/.exec(core);
      if (m) {
        if (m[2] === undefined) base = `exactly ${m[1]} times`;
        else if (m[2] === '') base = `at least ${m[1]} times`;
        else base = `between ${m[1]} and ${m[2]} times`;
      } else {
        base = 'quantifier';
      }
    }
  }
  return lazy ? `${base} (lazy)` : base;
}

function escapeMeaning(ch: string): string {
  const map: Record<string, string> = {
    d: 'digit [0-9]',
    D: 'non-digit',
    w: 'word character [A-Za-z0-9_]',
    W: 'non-word character',
    s: 'whitespace',
    S: 'non-whitespace',
    b: 'word boundary',
    B: 'non-word boundary',
    n: 'newline',
    r: 'carriage return',
    t: 'tab',
  };
  return map[ch] ?? `escaped literal "${ch}"`;
}

function flagExplanations(set: RegexMatchSet): string[] {
  const f = set.flags;
  const on: string[] = [];
  if (f.global) on.push('`g` — global: find all matches, not just the first');
  if (f.ignoreCase) on.push('`i` — ignore case');
  if (f.multiline) on.push('`m` — `^`/`$` match at line breaks');
  if (f.dotAll) on.push('`s` — `.` matches newlines');
  if (f.unicode) on.push('`u` — full Unicode mode');
  if (f.sticky) on.push('`y` — sticky: match only at lastIndex');
  if (f.hasIndices) on.push('`d` — record capture start/end offsets');
  return on;
}

/**
 * `regex.export.explain` — a local, structural markdown explanation of the
 * pattern: each token with its meaning, plus the active flags. Native
 * parsing only — no remote/LLM explanation.
 */
export function toExplain(set: RegexMatchSet): string {
  const out: string[] = ['# NekoRegex pattern explanation', ''];
  out.push(`Pattern: \`/${set.pattern}/${set.flags.applied}\``, '');
  if (!set.valid) {
    out.push(`> This pattern did not compile: ${set.error ?? 'unknown error'}`, '');
  }

  out.push('## Tokens', '');
  const tokens = explainTokens(set.pattern);
  if (tokens.length === 0) {
    out.push('(empty pattern)');
  } else {
    out.push('| token | meaning |', '| --- | --- |');
    for (const t of tokens) {
      out.push(`| \`${t.token.replace(/\|/g, '\\|')}\` | ${t.meaning} |`);
    }
  }

  const flags = flagExplanations(set);
  if (flags.length > 0) {
    out.push('', '## Flags', '');
    for (const f of flags) out.push(`- ${f}`);
  }

  if (set.namedGroupNames.length > 0) {
    out.push('', '## Named groups', '');
    for (const n of set.namedGroupNames) out.push(`- \`${n}\``);
  }

  out.push('');
  return out.join('\n');
}

// --- redaction.recipe ------------------------------------------------------

export interface RedactionRecipe {
  readonly tool: 'regex';
  /** The matcher: the pattern + applied flags this recipe redacts with. */
  readonly match: { readonly pattern: string; readonly flags: string };
  /** Replacement template applied to each match (e.g. `[REDACTED]`). */
  readonly replacement: string;
  /** Named groups preserved verbatim in the replacement, if any. */
  readonly preserveGroups: readonly string[];
  /** A JS one-liner that applies the recipe, for copy-paste. */
  readonly apply: string;
  readonly note: string;
}

/**
 * `regex.export.redaction.recipe` — a declarative JSON recipe that pairs the
 * tested pattern with a redaction replacement. It DESCRIBES the redaction
 * (the recipe-pack Pro engine would apply it across a corpus); this exporter
 * applies nothing. The default replacement is `[REDACTED]`; any named groups
 * are surfaced as candidates to preserve. The `apply` field is a ready
 * `String.prototype.replace` one-liner using the same pattern + flags.
 */
export function toRedactionRecipe(set: RegexMatchSet, replacement = '[REDACTED]'): RedactionRecipe {
  // Ensure the matcher is global so a redaction pass replaces every hit.
  const flags = set.flags.applied.includes('g') ? set.flags.applied : `${set.flags.applied}g`;
  const literal = `/${set.pattern}/${flags}`;
  return {
    tool: 'regex',
    match: { pattern: set.pattern, flags },
    replacement,
    preserveGroups: set.namedGroupNames,
    apply: `text.replace(${literal}, ${JSON.stringify(replacement)})`,
    note:
      'Descriptive recipe — apply it yourself or via the Pro recipe-pack runner. ' +
      'The matcher is forced global so every occurrence is redacted.',
  };
}
