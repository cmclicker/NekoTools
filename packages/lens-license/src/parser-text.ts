import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { LICENSE_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import { detectLicense } from './license.js';
import {
  LICENSE_KIND_PARSED,
  type LicenseArtifact,
  type LicenseParsedArtifact,
  type LicenseReport,
} from './kinds.js';

const TOOL_ID = 'license';
const PARSER_ID = 'license.text';

export interface LicenseTextParserDeps {
  readonly clock: Clock;
}

/**
 * The `license.text` parser. Identifies a pasted LICENSE text via signature
 * matching + an explicit SPDX tag, and reports the license's metadata.
 * Never throws; no network.
 */
export function createLicenseTextParser(deps: LicenseTextParserDeps): Parser<LicenseArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [LICENSE_KIND_PARSED],
    parse(input: ParserInput): ParserResult<LicenseArtifact> {
      return parseLicense(input, deps.clock.now());
    },
  };
}

function parseLicense(input: ParserInput, producedAt: string): ParserResult<LicenseArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  if (input.raw.trim() === '') {
    diagnostics.push(makeDiagnostic(diagIds(), 'info', LICENSE_DIAGNOSTIC_CODES.emptyInput, 'input is empty'));
    return {
      artifacts: [makeArtifact(artIds(), producedAt, input, { primary: null, spdxTag: null, matches: [], meta: null })],
      diagnostics,
    };
  }

  const d = detectLicense(input.raw);

  if (d.primary !== null) {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', LICENSE_DIAGNOSTIC_CODES.detected, `detected ${d.primary}${d.meta ? ` (${d.meta.category})` : ''}`),
    );
  } else {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'warning', LICENSE_DIAGNOSTIC_CODES.unknown, 'no known license signature matched'),
    );
  }

  // SPDX tag disagrees with what the text looks like.
  if (d.spdxTag !== null && d.matches.length > 0 && !d.matches.includes(d.spdxTag)) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'warning',
        LICENSE_DIAGNOSTIC_CODES.tagMismatch,
        `SPDX tag "${d.spdxTag}" does not match the detected license text (${d.matches.join(', ')})`,
      ),
    );
  }

  const report: LicenseReport = { primary: d.primary, spdxTag: d.spdxTag, matches: d.matches, meta: d.meta };
  return { artifacts: [makeArtifact(artIds(), producedAt, input, report)], diagnostics };
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: LicenseReport,
): LicenseParsedArtifact {
  return {
    version: 1,
    kind: LICENSE_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
