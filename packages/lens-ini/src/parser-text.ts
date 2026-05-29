import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { INI_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  GLOBAL_SECTION,
  INI_KIND_PARSED,
  type IniArtifact,
  type IniEntry,
  type IniParsedArtifact,
  type IniSection,
  type ParsedIni,
} from './kinds.js';

const TOOL_ID = 'ini';
const PARSER_ID = 'ini.text';

export interface IniTextParserDeps {
  readonly clock: Clock;
}

/**
 * The `ini.text` parser. Decodes INI / `.properties` / `.editorconfig`:
 * `[section]` headers, `key=value` / `key:value` entries, `;`/`#`/`!`
 * comments, and pre-section global keys. Duplicate keys keep the first
 * value (with a warning); duplicate sections merge. Never throws.
 */
export function createIniTextParser(deps: IniTextParserDeps): Parser<IniArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [INI_KIND_PARSED],
    parse(input: ParserInput): ParserResult<IniArtifact> {
      return parseIni(input, deps.clock.now());
    },
  };
}

function isComment(line: string): boolean {
  const c = line[0];
  return c === ';' || c === '#' || c === '!';
}

function parseIni(input: ParserInput, producedAt: string): ParserResult<IniArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  if (input.raw.trim() === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', INI_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return { artifacts: [makeArtifact(artIds(), producedAt, input, invalid())], diagnostics };
  }

  // Ordered sections with their entries + per-section seen-keys.
  const order: string[] = [];
  const sectionEntries = new Map<string, IniEntry[]>();
  const sectionKeys = new Map<string, Set<string>>();
  let keyCount = 0;

  const ensureSection = (name: string): void => {
    if (!sectionEntries.has(name)) {
      sectionEntries.set(name, []);
      sectionKeys.set(name, new Set());
      order.push(name);
    }
  };

  let current = GLOBAL_SECTION;
  const lines = input.raw.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i]!.trim();
    if (line === '' || isComment(line)) continue;

    if (line.startsWith('[')) {
      if (!line.endsWith(']')) {
        diagnostics.push(
          makeDiagnostic(diagIds(), 'warning', INI_DIAGNOSTIC_CODES.parseError, `line ${lineNo}: unterminated section header`),
        );
        continue;
      }
      const name = line.slice(1, -1).trim();
      if (name === '') {
        diagnostics.push(
          makeDiagnostic(diagIds(), 'warning', INI_DIAGNOSTIC_CODES.parseError, `line ${lineNo}: empty section name`),
        );
        continue;
      }
      if (sectionEntries.has(name)) {
        diagnostics.push(
          makeDiagnostic(diagIds(), 'info', INI_DIAGNOSTIC_CODES.duplicateSection, `section "${name}" repeats; entries merged`),
        );
      }
      ensureSection(name);
      current = name;
      continue;
    }

    // key = value  /  key : value (first delimiter wins)
    const eq = line.indexOf('=');
    const colon = line.indexOf(':');
    const delim = eq < 0 ? colon : colon < 0 ? eq : Math.min(eq, colon);
    if (delim < 0) {
      diagnostics.push(
        makeDiagnostic(diagIds(), 'warning', INI_DIAGNOSTIC_CODES.parseError, `line ${lineNo}: not a section or key=value: ${truncate(line)}`),
      );
      continue;
    }
    const key = line.slice(0, delim).trim();
    const value = line.slice(delim + 1).trim();
    if (key === '') {
      diagnostics.push(
        makeDiagnostic(diagIds(), 'warning', INI_DIAGNOSTIC_CODES.parseError, `line ${lineNo}: missing key before delimiter`),
      );
      continue;
    }

    ensureSection(current);
    const seen = sectionKeys.get(current)!;
    if (seen.has(key)) {
      diagnostics.push(
        makeDiagnostic(diagIds(), 'warning', INI_DIAGNOSTIC_CODES.duplicateKey, `key "${key}" in section "${current || '(global)'}" repeats; keeping the first value`),
      );
      continue;
    }
    seen.add(key);
    sectionEntries.get(current)!.push({ key, value });
    keyCount += 1;
  }

  const sections: IniSection[] = order.map((name) => ({ name, entries: sectionEntries.get(name)! }));
  const data = buildData(sections);

  const value: ParsedIni = {
    valid: true,
    sections,
    data,
    sectionCount: order.filter((n) => n !== GLOBAL_SECTION).length,
    keyCount,
  };
  return { artifacts: [makeArtifact(artIds(), producedAt, input, value)], diagnostics };
}

function buildData(sections: readonly IniSection[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const section of sections) {
    if (section.name === GLOBAL_SECTION) {
      for (const e of section.entries) data[e.key] = e.value;
    } else {
      const obj: Record<string, string> = {};
      for (const e of section.entries) obj[e.key] = e.value;
      data[section.name] = obj;
    }
  }
  return data;
}

function truncate(s: string): string {
  return s.length > 50 ? `${s.slice(0, 50)}…` : s;
}

function invalid(): ParsedIni {
  return { valid: false, sections: [], data: {}, sectionCount: 0, keyCount: 0 };
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: ParsedIni,
): IniParsedArtifact {
  return {
    version: 1,
    kind: INI_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
