import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { CSP_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  CSP_KIND_PARSED,
  type CspArtifact,
  type CspDirective,
  type CspFinding,
  type CspParsedArtifact,
  type CspReport,
  type FindingSeverity,
} from './kinds.js';

const TOOL_ID = 'csp';
const PARSER_ID = 'csp.text';

export interface CspTextParserDeps {
  readonly clock: Clock;
}

function sev(s: FindingSeverity): Diagnostic['severity'] {
  return s === 'high' ? 'error' : s === 'medium' ? 'warning' : 'info';
}

/**
 * The `csp.text` parser. Decodes a Content-Security-Policy header into
 * directives and runs a set of security checks. Never throws; no network.
 */
export function createCspTextParser(deps: CspTextParserDeps): Parser<CspArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [CSP_KIND_PARSED],
    parse(input: ParserInput): ParserResult<CspArtifact> {
      return parseCsp(input, deps.clock.now());
    },
  };
}

function parseCsp(input: ParserInput, producedAt: string): ParserResult<CspArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  // Strip an optional "Content-Security-Policy:" header prefix.
  const raw = input.raw.replace(/^\s*content-security-policy(-report-only)?\s*:/i, '').trim();

  if (raw === '') {
    diagnostics.push(makeDiagnostic(diagIds(), 'info', CSP_DIAGNOSTIC_CODES.emptyInput, 'input is empty'));
    return { artifacts: [makeArtifact(artIds(), producedAt, input, { directives: [], directiveCount: 0, findings: [] })], diagnostics };
  }

  const directives: CspDirective[] = [];
  const seen = new Set<string>();
  const findings: CspFinding[] = [];

  for (const seg of raw.split(';')) {
    const trimmed = seg.trim();
    if (trimmed === '') continue;
    const tokens = trimmed.split(/\s+/);
    const name = tokens[0]!.toLowerCase();
    const sources = tokens.slice(1);
    if (name === '') {
      diagnostics.push(makeDiagnostic(diagIds(), 'warning', CSP_DIAGNOSTIC_CODES.parseError, `segment "${trimmed}" has no directive name`));
      continue;
    }
    if (seen.has(name)) {
      findings.push({ directive: name, severity: 'medium', message: `directive "${name}" is duplicated; only the first applies` });
    } else {
      seen.add(name);
    }
    directives.push({ name, sources });

    // Per-directive source checks.
    for (const src of sources) {
      const s = src.toLowerCase();
      if (s === "'unsafe-inline'" && (name === 'script-src' || name === 'style-src')) {
        findings.push({ directive: name, severity: name === 'script-src' ? 'high' : 'medium', message: `${name} allows 'unsafe-inline'` });
      }
      if (s === "'unsafe-eval'") {
        findings.push({ directive: name, severity: 'high', message: `${name} allows 'unsafe-eval'` });
      }
      if (s === '*') {
        findings.push({ directive: name, severity: 'medium', message: `${name} uses a wildcard '*' source` });
      }
      if (s === 'data:' && name === 'script-src') {
        findings.push({ directive: name, severity: 'high', message: `script-src allows data: URIs (script injection risk)` });
      }
    }
  }

  // Whole-policy checks.
  if (!seen.has('default-src')) {
    findings.push({ directive: null, severity: 'low', message: 'no default-src — directives without an explicit value fall back to allowing everything' });
  }
  const objectSrc = directives.find((d) => d.name === 'object-src');
  if (objectSrc === undefined || !objectSrc.sources.map((s) => s.toLowerCase()).includes("'none'")) {
    findings.push({ directive: 'object-src', severity: 'low', message: "object-src is not 'none' — consider disabling plugins/embeds" });
  }
  if (!seen.has('frame-ancestors')) {
    findings.push({ directive: 'frame-ancestors', severity: 'low', message: 'no frame-ancestors — clickjacking is not restricted by CSP' });
  }

  // Emit a diagnostic per finding (severity by finding level).
  for (const f of findings) {
    const code = codeForFinding(f);
    diagnostics.push(makeDiagnostic(diagIds(), sev(f.severity), code, f.directive ? `[${f.directive}] ${f.message}` : f.message));
  }

  const report: CspReport = { directives, directiveCount: directives.length, findings };
  return { artifacts: [makeArtifact(artIds(), producedAt, input, report)], diagnostics };
}

function codeForFinding(f: CspFinding): string {
  if (/unsafe-inline/.test(f.message)) return CSP_DIAGNOSTIC_CODES.unsafeInline;
  if (/unsafe-eval/.test(f.message)) return CSP_DIAGNOSTIC_CODES.unsafeEval;
  if (/wildcard/.test(f.message)) return CSP_DIAGNOSTIC_CODES.wildcard;
  if (/data:/.test(f.message)) return CSP_DIAGNOSTIC_CODES.dataUri;
  if (/duplicated/.test(f.message)) return CSP_DIAGNOSTIC_CODES.duplicate;
  return CSP_DIAGNOSTIC_CODES.missingDirective;
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: CspReport,
): CspParsedArtifact {
  return {
    version: 1,
    kind: CSP_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
