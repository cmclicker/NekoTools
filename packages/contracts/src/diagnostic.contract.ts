import type { ContractVersion } from './version.js';

/**
 * Diagnostic — a structured annotation on an Artifact or input.
 *
 * Diagnostics are how every NekoTools tool reports problems, suggestions,
 * and observations. They are surfaced in the UI, included in exports,
 * and persisted in workspaces. They never throw — a tool that fails
 * loudly is a tool that lies about what it could parse.
 */
export interface Diagnostic {
  readonly version: ContractVersion;
  readonly id: string;
  readonly severity: DiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly span?: DiagnosticSpan;
  readonly artifactId?: string;
  readonly hint?: string;
  readonly tags?: readonly string[];
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

/**
 * A range into the original input. Line/column are 1-indexed for human
 * display; offset is a 0-indexed byte offset for tooling.
 */
export interface DiagnosticSpan {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly startLine?: number;
  readonly startColumn?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

export const DiagnosticSeverityRank: Record<DiagnosticSeverity, number> = {
  error: 3,
  warning: 2,
  info: 1,
  hint: 0,
};
