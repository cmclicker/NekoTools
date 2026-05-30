import { GITIGNORE_DIAGNOSTIC_CODES } from './diagnostics.js';
import { compileRule, testPaths, type CompiledRule } from './gitignore.js';
import type { GitignoreReport } from './kinds.js';

/**
 * NekoGitignore secret-leak coverage & hygiene audit. The Pro
 * `gitignore.export.audit.report` and `gitignore.export.sarif` exporters
 * render these findings. The headline check is **secret coverage**: it
 * compiles the user's rules with the engine's real matcher and tests a
 * built-in list of universally-sensitive paths (`.env`, `*.pem`, `id_rsa`,
 * `.npmrc`, …) — any path NOT ignored is a coverage gap that risks committing
 * a secret. Plus duplicate-pattern hygiene (reusing the parser's code as the
 * ruleId). Pure, local, deterministic; derived purely from the parsed rules —
 * no filesystem, no network.
 */

export type GitignoreAuditSeverity = 'high' | 'medium' | 'low' | 'info';

export interface GitignoreAuditFinding {
  readonly ruleId: string;
  readonly severity: GitignoreAuditSeverity;
  /** The path/pattern the finding is about, or `null`. */
  readonly target: string | null;
  readonly detail: string;
}

export const GITIGNORE_AUDIT_SEVERITY_RANK: Record<GitignoreAuditSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

/** Audit-only rule ids (the parser does not emit these as diagnostics). */
export const GITIGNORE_AUDIT_CODES = {
  uncoveredSecret: 'gitignore.uncovered_secret',
  uncoveredArtifact: 'gitignore.uncovered_artifact',
} as const;

interface SensitiveEntry {
  /** A concrete representative path the sensitive glob would produce. */
  readonly testPath: string;
  readonly label: string;
  readonly severity: GitignoreAuditSeverity;
  readonly kind: 'secret' | 'artifact';
}

/**
 * Paths you almost never want committed, regardless of stack. The audit flags
 * any that the ruleset does NOT ignore. Stack-specific build dirs
 * (node_modules, target, __pycache__) are deliberately excluded — flagging
 * them would be noise on repos that don't use that stack.
 */
const SENSITIVE: readonly SensitiveEntry[] = [
  { testPath: '.env', label: '.env (environment secrets)', severity: 'high', kind: 'secret' },
  { testPath: '.env.local', label: '.env.local (local env secrets)', severity: 'medium', kind: 'secret' },
  { testPath: 'id_rsa', label: 'id_rsa (SSH private key)', severity: 'high', kind: 'secret' },
  { testPath: 'id_ed25519', label: 'id_ed25519 (SSH private key)', severity: 'medium', kind: 'secret' },
  { testPath: 'server.pem', label: '*.pem (PEM private keys / certs)', severity: 'high', kind: 'secret' },
  { testPath: 'private.key', label: '*.key (private keys)', severity: 'high', kind: 'secret' },
  { testPath: 'cert.p12', label: '*.p12 (PKCS#12 keystore)', severity: 'medium', kind: 'secret' },
  { testPath: 'cert.pfx', label: '*.pfx (PKCS#12 keystore)', severity: 'medium', kind: 'secret' },
  { testPath: 'app.keystore', label: '*.keystore (Java keystore)', severity: 'medium', kind: 'secret' },
  { testPath: 'credentials.json', label: 'credentials.json (service credentials)', severity: 'high', kind: 'secret' },
  { testPath: '.npmrc', label: '.npmrc (registry auth token)', severity: 'high', kind: 'secret' },
  { testPath: '.pypirc', label: '.pypirc (PyPI auth)', severity: 'medium', kind: 'secret' },
  { testPath: '.DS_Store', label: '.DS_Store (macOS metadata)', severity: 'low', kind: 'artifact' },
  { testPath: 'debug.log', label: '*.log (logs — may contain secrets / PII)', severity: 'low', kind: 'artifact' },
];

export function auditGitignore(report: GitignoreReport | undefined): GitignoreAuditFinding[] {
  const findings: GitignoreAuditFinding[] = [];
  if (report === undefined) return findings;

  const seen = new Set<string>();
  const add = (
    ruleId: string,
    severity: GitignoreAuditSeverity,
    target: string | null,
    detail: string,
  ): void => {
    const key = `${ruleId}|${target ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ ruleId, severity, target, detail });
  };

  // Secret / artifact coverage — compile the user's rules with the engine's
  // real matcher and test each sensitive path against them.
  const compiled: CompiledRule[] = [];
  for (const rule of report.rules) {
    const c = compileRule(rule);
    if (c !== null) compiled.push(c);
  }
  const results = testPaths(
    compiled,
    SENSITIVE.map((s) => s.testPath),
  );
  results.forEach((result, i) => {
    const entry = SENSITIVE[i]!;
    if (!result.ignored) {
      add(
        entry.kind === 'secret'
          ? GITIGNORE_AUDIT_CODES.uncoveredSecret
          : GITIGNORE_AUDIT_CODES.uncoveredArtifact,
        entry.severity,
        entry.testPath,
        `${entry.label} is not covered by any ignore rule — risk of committing it`,
      );
    }
  });

  // Duplicate-pattern hygiene (reuse the parser's diagnostic code as ruleId).
  const dupSeen = new Map<string, number>();
  for (const rule of report.rules) {
    if (rule.pattern === null) continue;
    const key = `${rule.negated ? '!' : ''}${rule.pattern}${rule.dirOnly ? '/' : ''}`;
    if (dupSeen.has(key)) {
      add(
        GITIGNORE_DIAGNOSTIC_CODES.duplicate,
        'low',
        key,
        `pattern "${key}" is duplicated (lines ${dupSeen.get(key)} and ${rule.lineNo})`,
      );
    } else {
      dupSeen.set(key, rule.lineNo);
    }
  }

  return findings.sort(
    (a, b) =>
      GITIGNORE_AUDIT_SEVERITY_RANK[a.severity] - GITIGNORE_AUDIT_SEVERITY_RANK[b.severity] ||
      a.ruleId.localeCompare(b.ruleId) ||
      (a.target ?? '').localeCompare(b.target ?? ''),
  );
}
