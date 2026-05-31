import type { ParsedVersion, SemverComponents, SemverReport } from './kinds.js';

/**
 * NekoSemver Pro code generation. Backs the declared Pro exporters
 * `semver.export.range.report` (pro entitlement `export.range.report`) and
 * `semver.export.bump.plan` (pro entitlement `export.bump.plan`).
 *
 * Both are pure, deterministic functions of an already-parsed `SemverReport`
 * — no network, no clock, no registry lookup. They operate solely on the
 * versions, the supplied `range`, and the per-version `satisfies` flag that
 * the parser already computed. In particular (per the tool's outOfScope):
 *   - the range report does NOT re-resolve a range or query a registry; it
 *     only summarizes the `satisfies` data already on each version;
 *   - the bump plan does NOT infer a bump type from commit history — it
 *     presents the candidate next-major / next-minor / next-patch versions
 *     computed arithmetically from the highest valid version's components.
 */

// --- range report ----------------------------------------------------------

/**
 * A markdown report of the parsed versions against the parsed `range`. For
 * each valid version it shows whether it `satisfies` the range, summarizes
 * how many match, and lists matching vs non-matching versions. Pure function
 * of the `SemverReport` (the satisfies data is already computed per version).
 * When no range was supplied there is nothing to test against, so it says so.
 */
export function rangeReport(report: SemverReport): string {
  const lines: string[] = ['# NekoSemver range report', ''];

  if (report.range === null) {
    lines.push('No range was supplied, so there is nothing to test versions against.');
    return lines.join('\n');
  }

  const valid = report.versions.filter((v) => v.valid);
  const matching = valid.filter((v) => v.satisfies === true);
  const nonMatching = valid.filter((v) => v.satisfies === false);

  lines.push(
    `- range: \`${report.range}\``,
    `- versions tested: ${valid.length}`,
    `- matching: ${matching.length}`,
    `- non-matching: ${nonMatching.length}`,
    '',
    '## Per-version',
    '',
    '| version | satisfies |',
    '| --- | --- |',
  );
  for (const v of valid) {
    lines.push(`| ${v.version ?? '—'} | ${v.satisfies ? 'yes' : 'no'} |`);
  }

  lines.push('', '## Matching', '');
  if (matching.length > 0) {
    for (const v of matching) lines.push(`- ${v.version ?? '—'}`);
  } else {
    lines.push('- (none)');
  }

  lines.push('', '## Non-matching', '');
  if (nonMatching.length > 0) {
    for (const v of nonMatching) lines.push(`- ${v.version ?? '—'}`);
  } else {
    lines.push('- (none)');
  }

  return lines.join('\n');
}

// --- bump plan -------------------------------------------------------------

/** The highest valid parsed version in a report, or `null` if there are none. */
function highestValid(versions: readonly ParsedVersion[]): ParsedVersion | null {
  let best: ParsedVersion | null = null;
  for (const v of versions) {
    if (!v.valid || v.components === null) continue;
    if (best === null || compareComponents(v.components, best.components!) > 0) best = v;
  }
  return best;
}

/** Spec §11 precedence over components (build metadata ignored). */
function compareComponents(a: SemverComponents, b: SemverComponents): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  const aPre = a.prerelease !== null;
  const bPre = b.prerelease !== null;
  if (aPre === bPre) return 0;
  return aPre ? -1 : 1; // a prerelease has lower precedence than the release
}

/**
 * A candidate next version for one bump level, computed arithmetically from a
 * base version's components. The bump TYPE is never inferred (that would need
 * commit history, which is out of scope) — all three candidates are presented
 * so the caller chooses. Clearing a prerelease yields the same `major.minor.
 * patch` without the suffix.
 */
export interface BumpCandidate {
  readonly level: 'major' | 'minor' | 'patch' | 'release';
  readonly version: string;
}

function core(c: SemverComponents): string {
  return `${c.major}.${c.minor}.${c.patch}`;
}

/** Compute the candidate next versions from a base version's components. */
export function bumpCandidates(c: SemverComponents): readonly BumpCandidate[] {
  const candidates: BumpCandidate[] = [
    { level: 'major', version: `${c.major + 1}.0.0` },
    { level: 'minor', version: `${c.major}.${c.minor + 1}.0` },
    { level: 'patch', version: `${c.major}.${c.minor}.${c.patch + 1}` },
  ];
  // When the base is itself a prerelease, releasing it (clearing the suffix)
  // is a meaningful candidate that does not advance the numeric core.
  if (c.prerelease !== null) {
    candidates.push({ level: 'release', version: core(c) });
  }
  return candidates;
}

/**
 * A markdown bump plan: from the highest valid parsed version, present the
 * candidate next-major / next-minor / next-patch versions (and, if the base
 * is a prerelease, the cleared-prerelease release version). Pure function of
 * the `SemverReport`; no bump type is inferred. With no valid versions there
 * is no base to plan from.
 */
export function bumpPlan(report: SemverReport): string {
  const lines: string[] = ['# NekoSemver bump plan', ''];

  const base = highestValid(report.versions);
  if (base === null || base.components === null) {
    lines.push('No valid version was supplied, so there is no base to plan a bump from.');
    return lines.join('\n');
  }

  lines.push(
    `- base version: \`${base.version}\``,
    '',
    '| level | resulting version |',
    '| --- | --- |',
  );
  for (const cand of bumpCandidates(base.components)) {
    lines.push(`| ${cand.level} | ${cand.version} |`);
  }

  return lines.join('\n');
}
