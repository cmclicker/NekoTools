/**
 * Self-contained semver core: parsing, spec-precedence comparison, and a
 * pragmatic subset of node-semver range matching (comparators, ^, ~,
 * x-ranges, hyphen ranges, `||`). No dependencies, no network.
 */

export interface Semver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** Prerelease identifiers (empty array when none). */
  readonly prerelease: readonly string[];
  readonly build: string | null;
}

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** Parse a strict semantic version (an optional leading `v`/`=` is allowed). */
export function parseSemver(input: string): Semver | null {
  const cleaned = input.trim().replace(/^[v=]\s*/i, '');
  const m = SEMVER_RE.exec(cleaned);
  if (m === null) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] === undefined ? [] : m[4].split('.'),
    build: m[5] ?? null,
  };
}

/** Canonical string form (build metadata included). */
export function formatSemver(v: Semver): string {
  let s = `${v.major}.${v.minor}.${v.patch}`;
  if (v.prerelease.length > 0) s += `-${v.prerelease.join('.')}`;
  if (v.build !== null) s += `+${v.build}`;
  return s;
}

/** Spec §11 precedence comparison. Build metadata is ignored. */
export function compareSemver(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  const aPre = a.prerelease.length > 0;
  const bPre = b.prerelease.length > 0;
  if (!aPre && !bPre) return 0;
  if (aPre && !bPre) return -1;
  if (!aPre && bPre) return 1;
  return comparePrerelease(a.prerelease, b.prerelease);
}

function comparePrerelease(a: readonly string[], b: readonly string[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    const aNum = /^\d+$/.test(ai);
    const bNum = /^\d+$/.test(bi);
    if (aNum && bNum) {
      const d = Number(ai) - Number(bi);
      if (d !== 0) return d < 0 ? -1 : 1;
    } else if (aNum) {
      return -1; // numeric identifiers have lower precedence than alphanumeric
    } else if (bNum) {
      return 1;
    } else if (ai !== bi) {
      return ai < bi ? -1 : 1;
    }
  }
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return 0;
}

// --- ranges ----------------------------------------------------------------

type Op = '>=' | '>' | '<' | '<=' | '=';
interface Comparator {
  readonly op: Op;
  readonly ver: Semver;
}

function ver(major: number, minor: number, patch: number, prerelease: readonly string[] = []): Semver {
  return { major, minor, patch, prerelease, build: null };
}

interface Partial {
  readonly major: number | null;
  readonly minor: number | null;
  readonly patch: number | null;
  readonly prerelease: readonly string[];
}

function parsePartial(s: string): Partial | null {
  const cleaned = s.trim().replace(/^[v=]\s*/i, '');
  const m = /^(\d+|x|X|\*)(?:\.(\d+|x|X|\*)(?:\.(\d+|x|X|\*))?)?(?:-([0-9a-zA-Z.-]+))?$/.exec(cleaned);
  if (m === null) return null;
  const part = (t: string | undefined): number | null =>
    t === undefined || t === 'x' || t === 'X' || t === '*' ? null : Number(t);
  return {
    major: part(m[1]),
    minor: part(m[2]),
    patch: part(m[3]),
    prerelease: m[4] === undefined ? [] : m[4].split('.'),
  };
}

function expandComparator(token: string): Comparator[] | null {
  if (token === '' || token === '*' || token === 'x' || token === 'X') return [{ op: '>=', ver: ver(0, 0, 0) }];

  const opMatch = /^(>=|<=|>|<|=|\^|~)?\s*(.*)$/.exec(token);
  if (opMatch === null) return null;
  const prefix = opMatch[1] ?? '';
  const rest = opMatch[2] ?? '';
  const p = parsePartial(rest);
  if (p === null) return null;

  const M = p.major ?? 0;
  const m = p.minor ?? 0;
  const pa = p.patch ?? 0;
  const lower = ver(M, m, pa, p.prerelease);

  if (prefix === '^') return [{ op: '>=', ver: lower }, { op: '<', ver: caretUpper(p) }];
  if (prefix === '~') return [{ op: '>=', ver: lower }, { op: '<', ver: tildeUpper(p) }];
  if (prefix === '>=' || prefix === '>' || prefix === '<' || prefix === '<=') {
    return [{ op: prefix, ver: lower }];
  }
  // '=' or bare: exact when fully specified, else an x-range window.
  if (p.minor === null || p.patch === null) return xRange(p);
  return [{ op: '=', ver: lower }];
}

function xRange(p: Partial): Comparator[] {
  if (p.major === null) return [{ op: '>=', ver: ver(0, 0, 0) }];
  if (p.minor === null) {
    return [{ op: '>=', ver: ver(p.major, 0, 0) }, { op: '<', ver: ver(p.major + 1, 0, 0) }];
  }
  return [
    { op: '>=', ver: ver(p.major, p.minor, 0) },
    { op: '<', ver: ver(p.major, p.minor + 1, 0) },
  ];
}

function caretUpper(p: Partial): Semver {
  const M = p.major ?? 0;
  const m = p.minor ?? 0;
  const pa = p.patch ?? 0;
  if (M > 0) return ver(M + 1, 0, 0);
  if (m > 0) return ver(0, m + 1, 0);
  if (pa > 0) return ver(0, 0, pa + 1);
  // all zero: bound by the least-significant *specified* position
  if (p.patch !== null) return ver(0, 0, 1);
  if (p.minor !== null) return ver(0, 1, 0);
  return ver(1, 0, 0);
}

function tildeUpper(p: Partial): Semver {
  const M = p.major ?? 0;
  if (p.minor !== null) return ver(M, (p.minor ?? 0) + 1, 0);
  return ver(M + 1, 0, 0);
}

function parseRange(range: string): Comparator[][] | null {
  const orParts = range.split('||');
  const clauses: Comparator[][] = [];
  for (const orPart of orParts) {
    const trimmed = orPart.trim();
    const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(trimmed);
    if (hyphen !== null) {
      const lo = parsePartial(hyphen[1]!);
      const hi = parsePartial(hyphen[2]!);
      if (lo === null || hi === null) return null;
      const comps: Comparator[] = [{ op: '>=', ver: ver(lo.major ?? 0, lo.minor ?? 0, lo.patch ?? 0, lo.prerelease) }];
      // Partial upper bound becomes an exclusive next-increment.
      if (hi.minor === null) comps.push({ op: '<', ver: ver((hi.major ?? 0) + 1, 0, 0) });
      else if (hi.patch === null) comps.push({ op: '<', ver: ver(hi.major ?? 0, hi.minor + 1, 0) });
      else comps.push({ op: '<=', ver: ver(hi.major ?? 0, hi.minor, hi.patch, hi.prerelease) });
      clauses.push(comps);
      continue;
    }

    const tokens = trimmed === '' ? [''] : trimmed.split(/\s+/);
    const comps: Comparator[] = [];
    for (const token of tokens) {
      const expanded = expandComparator(token);
      if (expanded === null) return null;
      comps.push(...expanded);
    }
    clauses.push(comps);
  }
  return clauses;
}

function satisfiesComparator(v: Semver, c: Comparator): boolean {
  const cmp = compareSemver(v, c.ver);
  switch (c.op) {
    case '>=': return cmp >= 0;
    case '>': return cmp > 0;
    case '<': return cmp < 0;
    case '<=': return cmp <= 0;
    case '=': return cmp === 0;
  }
}

function sameTuple(a: Semver, b: Semver): boolean {
  return a.major === b.major && a.minor === b.minor && a.patch === b.patch;
}

/** Does `version` satisfy `range`? Returns `null` if the range is unparseable. */
export function satisfies(version: Semver, range: string): boolean | null {
  const clauses = parseRange(range);
  if (clauses === null) return null;
  const vHasPre = version.prerelease.length > 0;

  for (const clause of clauses) {
    if (!clause.every((c) => satisfiesComparator(version, c))) continue;
    // node-semver prerelease gate: a prerelease version only matches if some
    // comparator in the clause is itself a prerelease of the same tuple.
    if (vHasPre) {
      const allowed = clause.some((c) => c.ver.prerelease.length > 0 && sameTuple(c.ver, version));
      if (!allowed) continue;
    }
    return true;
  }
  return false;
}

/** Validate a range without testing a version (for diagnostics). */
export function isValidRange(range: string): boolean {
  return parseRange(range) !== null;
}
