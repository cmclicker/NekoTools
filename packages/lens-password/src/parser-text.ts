import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { PASSWORD_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  PASSWORD_KIND_REPORT,
  type PasswordArtifact,
  type PasswordReport,
  type PasswordReportArtifact,
} from './kinds.js';
import { assessPassword } from './strength.js';

const TOOL_ID = 'password';
const PARSER_ID = 'password.text';

export interface PasswordTextParserDeps {
  readonly clock: Clock;
}

/**
 * The `password.text` parser. Assesses the strength of the input
 * password/passphrase and emits a `password.report` artifact carrying only
 * derived metrics — the password itself is never stored, exported, or
 * round-tripped. Pure local heuristics; no network.
 */
export function createPasswordTextParser(deps: PasswordTextParserDeps): Parser<PasswordArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [PASSWORD_KIND_REPORT],
    parse(input: ParserInput): ParserResult<PasswordArtifact> {
      return assess(input, deps.clock.now());
    },
  };
}

function assess(input: ParserInput, producedAt: string): ParserResult<PasswordArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  // Strip only a trailing newline (textarea/paste artifact); internal spaces
  // are significant in a passphrase and are preserved.
  const password = input.raw.replace(/\r?\n+$/, '');

  if (password === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', PASSWORD_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return { artifacts: [makeArtifact(artIds(), producedAt, input, assessPassword(''))], diagnostics };
  }

  const report = assessPassword(password);

  for (const warning of report.warnings) {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'warning', PASSWORD_DIAGNOSTIC_CODES.pattern, warning),
    );
  }

  const severity = report.score <= 0 ? 'error' : report.score <= 1 ? 'warning' : 'info';
  diagnostics.push(
    makeDiagnostic(
      diagIds(),
      severity,
      PASSWORD_DIAGNOSTIC_CODES.assessment,
      `${report.label} — ~${report.entropyBits} bits of entropy (score ${report.score}/4)`,
      undefined,
      'assessed entirely on-device; the password is never stored or uploaded.',
    ),
  );

  return { artifacts: [makeArtifact(artIds(), producedAt, input, report)], diagnostics };
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: PasswordReport,
): PasswordReportArtifact {
  return {
    version: 1,
    kind: PASSWORD_KIND_REPORT,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    // The source bytes count is fine to keep, but the raw value is not stored.
    source: input.source,
    value,
  };
}
