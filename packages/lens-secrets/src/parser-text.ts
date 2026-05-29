import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { SECRET_DIAGNOSTIC_CODES, makeDiagnostic, toDiagnosticSeverity } from './diagnostics.js';
import {
  SECRET_KIND_REPORT,
  type SecretArtifact,
  type SecretFinding,
  type SecretReport,
  type SecretReportArtifact,
} from './kinds.js';
import { SECRET_RULES } from './rules.js';

const TOOL_ID = 'secrets';
const PARSER_ID = 'secret.text';

export interface SecretTextParserDeps {
  readonly clock: Clock;
  /** Minimum Shannon entropy (bits/char) for the entropy fallback. Default 4.0. */
  readonly entropyThreshold?: number;
  /** Minimum token length for the entropy fallback. Default 20. */
  readonly entropyMinLength?: number;
}

const DEFAULT_ENTROPY_THRESHOLD = 4.0;
const DEFAULT_ENTROPY_MIN_LENGTH = 20;
const ENTROPY_TOKEN_RE = /[A-Za-z0-9+/=_-]{20,}/g;

/**
 * The `secret.text` parser. Scans pasted text for leaked credentials using
 * known-provider patterns plus a Shannon-entropy fallback, and produces a
 * `secret.report` artifact whose findings carry only MASKED previews +
 * locations — never the raw secret. Pure local string analysis; no network.
 */
export function createSecretTextParser(deps: SecretTextParserDeps): Parser<SecretArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [SECRET_KIND_REPORT],
    parse(input: ParserInput): ParserResult<SecretArtifact> {
      return scan(input, deps);
    },
  };
}

interface RawHit {
  readonly ruleId: string;
  readonly description: string;
  readonly severity: SecretFinding['severity'];
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly entropy: number | null;
}

function scan(input: ParserInput, deps: SecretTextParserDeps): ParserResult<SecretArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const producedAt = deps.clock.now();
  const diagnostics: Diagnostic[] = [];
  const raw = input.raw;

  if (raw.trim() === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', SECRET_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return {
      artifacts: [makeArtifact(artIds(), producedAt, input, { findingCount: 0, findings: [] })],
      diagnostics,
    };
  }

  const threshold = deps.entropyThreshold ?? DEFAULT_ENTROPY_THRESHOLD;
  const minLen = deps.entropyMinLength ?? DEFAULT_ENTROPY_MIN_LENGTH;

  const hits: RawHit[] = [];

  // 1. Pattern rules.
  for (const rule of SECRET_RULES) {
    for (const m of raw.matchAll(rule.regex)) {
      const whole = m[0];
      const secret = rule.group !== undefined ? (m[rule.group] ?? '') : whole;
      if (secret === '') continue;
      const start = (m.index ?? 0) + (rule.group !== undefined ? whole.lastIndexOf(secret) : 0);
      hits.push({
        ruleId: rule.id,
        description: rule.description,
        severity: rule.severity,
        start,
        end: start + secret.length,
        text: secret,
        entropy: null,
      });
    }
  }

  // 2. Entropy fallback for high-randomness tokens not already covered.
  for (const m of raw.matchAll(ENTROPY_TOKEN_RE)) {
    const token = m[0];
    const start = m.index ?? 0;
    const end = start + token.length;
    if (token.length < minLen) continue;
    if (hits.some((h) => start < h.end && end > h.start)) continue; // overlaps a rule hit
    const entropy = shannonEntropy(token);
    if (entropy < threshold) continue;
    hits.push({
      ruleId: 'entropy.high',
      description: 'High-entropy string (possible secret)',
      severity: 'low',
      start,
      end,
      text: token,
      entropy,
    });
  }

  const lineStarts = computeLineStarts(raw);
  const findings: SecretFinding[] = hits
    .map((h) => {
      const { line, column } = locate(lineStarts, h.start);
      return {
        ruleId: h.ruleId,
        description: h.description,
        severity: h.severity,
        line,
        column,
        length: h.text.length,
        preview: mask(h.text),
        entropy: h.entropy === null ? null : Math.round(h.entropy * 100) / 100,
      };
    })
    .sort((a, b) => a.line - b.line || a.column - b.column || a.ruleId.localeCompare(b.ruleId));

  for (const f of findings) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        toDiagnosticSeverity(f.severity),
        SECRET_DIAGNOSTIC_CODES.finding,
        `${f.description} (${f.ruleId}) at line ${f.line}:${f.column} — ${f.preview}`,
        undefined,
        'rotate this credential and remove it from source; values are never uploaded by NekoSecrets.',
      ),
    );
  }
  if (findings.length === 0) {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', SECRET_DIAGNOSTIC_CODES.clean, 'no secrets detected'),
    );
  }

  const report: SecretReport = { findingCount: findings.length, findings };
  return { artifacts: [makeArtifact(artIds(), producedAt, input, report)], diagnostics };
}

/** first 4 + bullets + last 2, all bullets for short matches. Never reveals the body. */
function mask(s: string): string {
  if (s.length <= 8) return '•'.repeat(s.length);
  const head = s.slice(0, 4);
  const tail = s.slice(-2);
  return `${head}${'•'.repeat(Math.min(s.length - 6, 12))}${tail}`;
}

function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let e = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    e -= p * Math.log2(p);
  }
  return e;
}

function computeLineStarts(s: string): number[] {
  const starts = [0];
  for (let i = 0; i < s.length; i++) if (s[i] === '\n') starts.push(i + 1);
  return starts;
}

function locate(lineStarts: readonly number[], index: number): { line: number; column: number } {
  // Largest lineStart <= index.
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid]! <= index) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: index - lineStarts[lo]! + 1 };
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: SecretReport,
): SecretReportArtifact {
  return {
    version: 1,
    kind: SECRET_KIND_REPORT,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
