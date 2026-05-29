import type { Artifact } from '@nekotools/contracts';

/**
 * NekoSecrets artifact kinds (namespaced under `secret.*`).
 *
 *   `secret.report` — the result of scanning pasted text for leaked
 *                     credentials. Crucially, a finding stores only a
 *                     MASKED preview, the rule id, the location, and the
 *                     match length — never the raw secret. So the artifact
 *                     (and therefore every export + workspace round-trip)
 *                     is safe to persist and share; the cleartext secret
 *                     only ever lives in the user's own input box.
 */
export const SECRET_KIND_REPORT = 'secret.report';

export const ALL_SECRET_KINDS = [SECRET_KIND_REPORT] as const;

export type SecretSeverity = 'high' | 'medium' | 'low';

export interface SecretFinding {
  /** Stable rule id, e.g. `aws.access-key`, `github.token`, `entropy.high`. */
  readonly ruleId: string;
  /** Human-readable label for the rule. */
  readonly description: string;
  readonly severity: SecretSeverity;
  /** 1-based line of the match. */
  readonly line: number;
  /** 1-based column of the match. */
  readonly column: number;
  /** Length (chars) of the matched secret. */
  readonly length: number;
  /** Masked preview — leading identifier kept, body replaced with bullets. */
  readonly preview: string;
  /** Shannon entropy (bits/char) of the match, or `null` if not computed. */
  readonly entropy: number | null;
}

/** The parsed body of a `secret.report` artifact. */
export interface SecretReport {
  readonly findingCount: number;
  readonly findings: readonly SecretFinding[];
  /**
   * The input with every detected secret span replaced by
   * `[REDACTED:<ruleId>]`. Safe to persist/share — it contains no raw
   * secret. Consumed by the Pro `secret.export.redacted` exporter.
   */
  readonly redactedText: string;
}

export type SecretReportArtifact = Artifact<'secret.report', SecretReport>;
export type SecretArtifact = SecretReportArtifact;

export const SECRET_REPORT_EXPORT_KINDS = [SECRET_KIND_REPORT] as const;
