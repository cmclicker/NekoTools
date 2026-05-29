import type { Artifact } from '@nekotools/contracts';

/**
 * NekoCSP artifact kinds (namespaced under `csp.*`).
 *
 *   `csp.parsed` — a Content-Security-Policy header decoded into ordered
 *                  directives (name + source list), plus a structured set
 *                  of security findings. Pure string analysis; no network.
 */
export const CSP_KIND_PARSED = 'csp.parsed';

export const ALL_CSP_KINDS = [CSP_KIND_PARSED] as const;

export interface CspDirective {
  readonly name: string;
  readonly sources: readonly string[];
}

export type FindingSeverity = 'high' | 'medium' | 'low';

export interface CspFinding {
  readonly directive: string | null;
  readonly severity: FindingSeverity;
  readonly message: string;
}

/** The parsed body of a `csp.parsed` artifact. */
export interface CspReport {
  readonly directives: readonly CspDirective[];
  readonly directiveCount: number;
  readonly findings: readonly CspFinding[];
}

export type CspParsedArtifact = Artifact<'csp.parsed', CspReport>;
export type CspArtifact = CspParsedArtifact;

export const CSP_PARSED_EXPORT_KINDS = [CSP_KIND_PARSED] as const;
