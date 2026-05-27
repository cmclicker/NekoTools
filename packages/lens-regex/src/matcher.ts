import type { RegexCaptureGroup, RegexFlagInfo, RegexMatch } from './kinds.js';

/**
 * Native-RegExp matching core, isolated from artifact/diagnostic plumbing
 * (the same adapter seam lens-yaml keeps in `yaml-adapter.ts`). Everything
 * here is pure and uses only the platform `RegExp` — no `eval`, no
 * `Function`, no third-party engine.
 */

/** Native RegExp flags supported by the engine (V8 / Node 20+). */
export const SUPPORTED_FLAGS = 'dgimsuvy';

/** Default cap on matches collected for a global pattern (runaway guard). */
export const DEFAULT_MAX_MATCHES = 10_000;

const SUPPORTED_SET = new Set(SUPPORTED_FLAGS);

export interface FlagAnalysis {
  readonly info: RegexFlagInfo;
  /** Flag chars that are not valid native RegExp flags. */
  readonly unsupported: readonly string[];
  /** Supported flag chars supplied more than once (RegExp would throw). */
  readonly duplicates: readonly string[];
}

/** Classify a raw flag string into the applied subset + problems. */
export function analyzeFlags(raw: string): FlagAnalysis {
  const seen = new Set<string>();
  const unsupported: string[] = [];
  const duplicates: string[] = [];
  const applied: string[] = [];
  for (const ch of raw) {
    if (!SUPPORTED_SET.has(ch)) {
      if (!unsupported.includes(ch)) unsupported.push(ch);
      continue;
    }
    if (seen.has(ch)) {
      if (!duplicates.includes(ch)) duplicates.push(ch);
      continue;
    }
    seen.add(ch);
    applied.push(ch);
  }
  const info: RegexFlagInfo = {
    raw,
    applied: applied.join(''),
    global: seen.has('g'),
    ignoreCase: seen.has('i'),
    multiline: seen.has('m'),
    dotAll: seen.has('s'),
    unicode: seen.has('u'),
    sticky: seen.has('y'),
    hasIndices: seen.has('d'),
    unsupported,
  };
  return { info, unsupported, duplicates };
}

/**
 * Distinct named-group names declared in a pattern, in source order.
 * Matches `(?<name>` while excluding lookbehind `(?<=` / `(?<!` (whose
 * second char is not a valid identifier start).
 */
export function namedGroupNames(source: string): string[] {
  const re = /\(\?<([A-Za-z_$][A-Za-z0-9_$]*)>/g;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const name = m[1];
    if (name !== undefined && !names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * Count capturing groups in a compiled pattern using the empty-alternation
 * probe: `(?:source)|` always matches the empty string and returns the full
 * group vector, so `result.length - 1` is the capturing-group count. The
 * `g`/`y` flags are dropped so the probe runs deterministically from index 0.
 */
function countGroups(re: RegExp): number {
  try {
    const probe = new RegExp(`${re.source}|`, re.flags.replace(/[gy]/g, ''));
    const result = probe.exec('');
    return result ? result.length - 1 : 0;
  } catch {
    return 0;
  }
}

export interface MatchOutcome {
  readonly valid: boolean;
  readonly error: string | null;
  readonly matches: readonly RegexMatch[];
  readonly truncated: boolean;
  readonly groupCount: number;
  readonly namedGroupNames: readonly string[];
}

/** Compile `pattern` with `flagInfo.applied` and run it over `sample`. */
export function runMatch(
  pattern: string,
  flagInfo: RegexFlagInfo,
  sample: string,
  maxMatches: number,
): MatchOutcome {
  let re: RegExp;
  try {
    re = new RegExp(pattern, flagInfo.applied);
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
      matches: [],
      truncated: false,
      groupCount: 0,
      namedGroupNames: namedGroupNames(pattern),
    };
  }

  const matches: RegexMatch[] = [];
  let truncated = false;

  if (flagInfo.global) {
    // `matchAll` requires the global flag and safely advances `lastIndex`
    // past zero-length matches, so it cannot infinite-loop.
    for (const m of sample.matchAll(re)) {
      if (matches.length >= maxMatches) {
        truncated = true;
        break;
      }
      matches.push(toMatch(m, matches.length, flagInfo.hasIndices));
    }
  } else {
    const m = re.exec(sample);
    if (m !== null) matches.push(toMatch(m, 0, flagInfo.hasIndices));
  }

  return {
    valid: true,
    error: null,
    matches,
    truncated,
    groupCount: countGroups(re),
    namedGroupNames: namedGroupNames(pattern),
  };
}

type WithIndices = (RegExpMatchArray | RegExpExecArray) & {
  indices?: Array<[number, number] | undefined>;
};

function toMatch(
  m: RegExpMatchArray | RegExpExecArray,
  ordinal: number,
  hasIndices: boolean,
): RegexMatch {
  const full = m[0] ?? '';
  const start = m.index ?? 0;
  const indices = (m as WithIndices).indices;

  const groups: RegexCaptureGroup[] = [];
  for (let i = 1; i < m.length; i += 1) {
    let gStart: number | null = null;
    let gEnd: number | null = null;
    if (hasIndices && indices) {
      const pair = indices[i];
      if (pair) {
        gStart = pair[0];
        gEnd = pair[1];
      }
    }
    groups.push({ index: i, name: null, value: m[i] ?? null, start: gStart, end: gEnd });
  }

  const namedGroups: Record<string, string | null> = {};
  if (m.groups) {
    for (const key of Object.keys(m.groups)) {
      namedGroups[key] = m.groups[key] ?? null;
    }
  }

  return { ordinal, value: full, start, end: start + full.length, groups, namedGroups };
}
