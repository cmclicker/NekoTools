import type { Artifact } from '@nekotools/contracts';

/**
 * NekoPassword artifact kinds (namespaced under `password.*`).
 *
 *   `password.report` — a strength assessment of a password/passphrase.
 *                       CRITICALLY, the artifact never stores the password
 *                       itself — only derived metrics (length, character
 *                       classes, entropy, score, crack-time estimates,
 *                       warnings). The cleartext only lives in the user's
 *                       input box; nothing sensitive is persisted/exported.
 */
export const PASSWORD_KIND_REPORT = 'password.report';

export const ALL_PASSWORD_KINDS = [PASSWORD_KIND_REPORT] as const;

export interface CharClasses {
  readonly lower: boolean;
  readonly upper: boolean;
  readonly digit: boolean;
  readonly symbol: boolean;
  readonly other: boolean;
}

export interface CrackTime {
  /** Attacker scenario label. */
  readonly scenario: string;
  /** Estimated seconds to crack (may be Infinity). */
  readonly seconds: number;
  /** Humanized display ("3 hours", "centuries", …). */
  readonly display: string;
}

/** The parsed body of a `password.report` artifact. */
export interface PasswordReport {
  readonly length: number;
  readonly charClasses: CharClasses;
  readonly poolSize: number;
  /** Estimated guess entropy in bits (after pattern penalties). */
  readonly entropyBits: number;
  /** Naive brute-force entropy: length × log2(pool). */
  readonly bruteforceBits: number;
  /** Shannon entropy of the string × length. */
  readonly shannonBits: number;
  /** 0 (very weak) – 4 (strong). */
  readonly score: 0 | 1 | 2 | 3 | 4;
  readonly label: string;
  readonly crackTimes: readonly CrackTime[];
  readonly warnings: readonly string[];
  readonly suggestions: readonly string[];
}

export type PasswordReportArtifact = Artifact<'password.report', PasswordReport>;
export type PasswordArtifact = PasswordReportArtifact;

export const PASSWORD_REPORT_EXPORT_KINDS = [PASSWORD_KIND_REPORT] as const;
