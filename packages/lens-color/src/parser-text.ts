import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import {
  contrastRatio,
  parseColor,
  relativeLuminance,
  toHex,
  toHslString,
  toRgbString,
} from './color.js';
import { COLOR_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  COLOR_KIND_PARSED,
  type ColorArtifact,
  type ColorParsedArtifact,
  type ColorReport,
  type ParsedColor,
} from './kinds.js';

const TOOL_ID = 'color';
const PARSER_ID = 'color.text';

// Luminance of pure white (1.0) and black (0.0).
const WHITE_L = 1;
const BLACK_L = 0;

export interface ColorTextParserDeps {
  readonly clock: Clock;
}

/**
 * The `color.text` parser. Parses each input line as a color (hex / rgb() /
 * hsl() / CSS named) and emits normalized forms plus WCAG luminance and
 * contrast vs white/black. Never throws; an unrecognized line yields a
 * `color.parse_error` and an invalid entry. No network.
 */
export function createColorTextParser(deps: ColorTextParserDeps): Parser<ColorArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [COLOR_KIND_PARSED],
    parse(input: ParserInput): ParserResult<ColorArtifact> {
      return parseColors(input, deps.clock.now());
    },
  };
}

function parseColors(input: ParserInput, producedAt: string): ParserResult<ColorArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  if (input.raw.trim() === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', COLOR_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return { artifacts: [makeArtifact(artIds(), producedAt, input, { count: 0, colors: [] })], diagnostics };
  }

  const lines = input.raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  const colors: ParsedColor[] = [];

  for (const line of lines) {
    const parsed = parseColor(line);
    if (parsed === null) {
      colors.push({
        input: line,
        valid: false,
        format: null,
        rgba: null,
        hex: null,
        rgb: null,
        hsl: null,
        luminance: null,
        contrastWhite: null,
        contrastBlack: null,
      });
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          COLOR_DIAGNOSTIC_CODES.parseError,
          `"${truncate(line)}" is not a recognizable color`,
        ),
      );
      continue;
    }
    const lum = relativeLuminance(parsed.rgba);
    colors.push({
      input: line,
      valid: true,
      format: parsed.format,
      rgba: parsed.rgba,
      hex: toHex(parsed.rgba),
      rgb: toRgbString(parsed.rgba),
      hsl: toHslString(parsed.rgba),
      luminance: lum,
      contrastWhite: contrastRatio(lum, WHITE_L),
      contrastBlack: contrastRatio(lum, BLACK_L),
    });
  }

  return { artifacts: [makeArtifact(artIds(), producedAt, input, { count: colors.length, colors })], diagnostics };
}

function truncate(s: string): string {
  return s.length > 50 ? `${s.slice(0, 50)}…` : s;
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: ColorReport,
): ColorParsedArtifact {
  return {
    version: 1,
    kind: COLOR_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
