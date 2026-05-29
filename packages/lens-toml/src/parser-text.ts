import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import { TOML_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import {
  TOML_KIND_PARSED,
  type ParsedToml,
  type TomlArtifact,
  type TomlParsedArtifact,
  type TomlValue,
} from './kinds.js';

const TOOL_ID = 'toml';
const PARSER_ID = 'toml.text';

export interface TomlTextParserDeps {
  readonly clock: Clock;
}

/** Thrown for a structurally invalid line — surfaces as `toml.parse_error`. */
class TomlParseError extends Error {}
/** Thrown for valid TOML this MVP slice does not decode — `toml.unsupported`. */
class TomlUnsupportedError extends Error {}

type MutableTable = Record<string, unknown>;

/**
 * The `toml.text` parser. Decodes a TOML document into a JSON-compatible
 * value tree plus structural counts, and never throws — a malformed line
 * produces a `toml.parse_error` diagnostic (carrying its 1-based line
 * number) and a best-effort (`valid: false`) artifact rather than an
 * exception.
 *
 * Supported subset (engine MVP): comments, bare/quoted/dotted keys,
 * `[table]` and `[[array-of-table]]` headers, single-line basic + literal
 * strings, integers (dec/hex/oct/bin with `_` separators), floats,
 * booleans, single-line arrays, inline tables, and date-times (kept as
 * strings). Multi-line strings/arrays are reported as `toml.unsupported`
 * and skipped — see the manifest `outOfScope`.
 */
export function createTomlTextParser(deps: TomlTextParserDeps): Parser<TomlArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [TOML_KIND_PARSED],
    parse(input: ParserInput): ParserResult<TomlArtifact> {
      return parseTomlText(input, deps);
    },
  };
}

function parseTomlText(input: ParserInput, deps: TomlTextParserDeps): ParserResult<TomlArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const producedAt = deps.clock.now();
  const diagnostics: Diagnostic[] = [];

  if (input.raw.trim() === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', TOML_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return { artifacts: [makeArtifact(artIds(), producedAt, input, invalidValue())], diagnostics };
  }

  const root: MutableTable = {};
  let current: MutableTable = root;
  let tableCount = 0;
  let keyCount = 0;
  let fatal = false;

  const pushParseError = (line: number, message: string): void => {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'error',
        TOML_DIAGNOSTIC_CODES.parseError,
        `line ${line}: ${message}`,
      ),
    );
    fatal = true;
  };

  const lines = input.raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const content = stripComment(lines[i] ?? '').trim();
    if (content === '') continue;

    try {
      if (content.startsWith('[[')) {
        current = openArrayOfTables(root, content);
        tableCount += 1;
      } else if (content.startsWith('[')) {
        current = openTable(root, content);
        tableCount += 1;
      } else {
        assignKeyValue(current, content, diagnostics, diagIds);
        keyCount += 1;
      }
    } catch (err) {
      if (err instanceof TomlUnsupportedError) {
        diagnostics.push(
          makeDiagnostic(
            diagIds(),
            'warning',
            TOML_DIAGNOSTIC_CODES.unsupported,
            `line ${lineNo}: ${err.message}`,
            undefined,
            'this quick slice decodes single-line constructs; the line was skipped, not mis-parsed.',
          ),
        );
      } else if (err instanceof TomlParseError) {
        pushParseError(lineNo, err.message);
      } else {
        pushParseError(lineNo, err instanceof Error ? err.message : String(err));
      }
    }
  }

  const hasContent = Object.keys(root).length > 0;
  const value: ParsedToml = {
    valid: !fatal,
    data: !fatal || hasContent ? (root as TomlValue) : null,
    tableCount,
    keyCount,
  };
  return { artifacts: [makeArtifact(artIds(), producedAt, input, value)], diagnostics };
}

// --- table headers ---------------------------------------------------------

function openTable(root: MutableTable, content: string): MutableTable {
  if (!content.endsWith(']')) throw new TomlParseError('unterminated table header');
  const path = parseKeyPath(content.slice(1, -1).trim());
  if (path.length === 0) throw new TomlParseError('empty table header');
  return descendTable(root, path);
}

function openArrayOfTables(root: MutableTable, content: string): MutableTable {
  if (!content.endsWith(']]')) throw new TomlParseError('unterminated array-of-table header');
  const path = parseKeyPath(content.slice(2, -2).trim());
  if (path.length === 0) throw new TomlParseError('empty array-of-table header');

  const parent = descendTable(root, path.slice(0, -1));
  const key = path[path.length - 1] as string;
  const existing = parent[key];
  let arr: MutableTable[];
  if (existing === undefined) {
    arr = [];
    parent[key] = arr;
  } else if (Array.isArray(existing)) {
    arr = existing as MutableTable[];
  } else {
    throw new TomlParseError(`"${key}" is already defined as a non-array`);
  }
  const entry: MutableTable = {};
  arr.push(entry);
  return entry;
}

/** Walk/create nested plain tables for a dotted path; the final node is a table. */
function descendTable(root: MutableTable, path: readonly string[]): MutableTable {
  let node = root;
  for (const key of path) {
    const next = node[key];
    if (next === undefined) {
      const created: MutableTable = {};
      node[key] = created;
      node = created;
    } else if (Array.isArray(next)) {
      // Dotted descent through an array-of-tables targets its last entry.
      const arr = next as MutableTable[];
      const last = arr[arr.length - 1];
      if (last === undefined) throw new TomlParseError(`"${key}" is an empty array`);
      node = last;
    } else if (isPlainTable(next)) {
      node = next as MutableTable;
    } else {
      throw new TomlParseError(`"${key}" is already defined as a value, not a table`);
    }
  }
  return node;
}

// --- key = value -----------------------------------------------------------

function assignKeyValue(
  current: MutableTable,
  content: string,
  diagnostics: Diagnostic[],
  diagIds: () => string,
): void {
  const eq = findAssignEq(content);
  if (eq < 0) throw new TomlParseError('expected "key = value"');
  const keyPart = content.slice(0, eq).trim();
  const valuePart = content.slice(eq + 1).trim();
  if (keyPart === '') throw new TomlParseError('missing key before "="');
  if (valuePart === '') throw new TomlParseError('missing value after "="');

  const path = parseKeyPath(keyPart);
  const value = parseValue(valuePart);

  let node = current;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i] as string;
    const next = node[key];
    if (next === undefined) {
      const created: MutableTable = {};
      node[key] = created;
      node = created;
    } else if (isPlainTable(next)) {
      node = next as MutableTable;
    } else {
      throw new TomlParseError(`"${key}" is already defined as a value, not a table`);
    }
  }

  const leaf = path[path.length - 1] as string;
  if (Object.prototype.hasOwnProperty.call(node, leaf)) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'warning',
        TOML_DIAGNOSTIC_CODES.duplicateKey,
        `key "${leaf}" is assigned more than once; keeping the first value`,
      ),
    );
    return;
  }
  node[leaf] = value;
}

// --- value parsing ---------------------------------------------------------

const DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}([Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})?)?$/;
const TIME_RE = /^\d{2}:\d{2}:\d{2}(\.\d+)?$/;
const DEC_INT_RE = /^[+-]?(0|[1-9](_?\d)*)$/;
const HEX_INT_RE = /^0x[0-9a-fA-F](_?[0-9a-fA-F])*$/;
const OCT_INT_RE = /^0o[0-7](_?[0-7])*$/;
const BIN_INT_RE = /^0b[01](_?[01])*$/;
const FLOAT_RE = /^[+-]?(0|[1-9](_?\d)*)(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;

function parseValue(expr: string): TomlValue {
  const first = expr[0];

  if (first === '"') {
    if (expr.startsWith('"""')) throw new TomlUnsupportedError('multi-line basic string');
    return parseBasicString(expr);
  }
  if (first === "'") {
    if (expr.startsWith("'''")) throw new TomlUnsupportedError('multi-line literal string');
    return parseLiteralString(expr);
  }
  if (first === '[') return parseArray(expr);
  if (first === '{') return parseInlineTable(expr);

  if (expr === 'true') return true;
  if (expr === 'false') return false;

  if (DATETIME_RE.test(expr) || TIME_RE.test(expr)) return expr;

  // inf / nan are valid TOML floats but not valid JSON numbers; keep the
  // original token as a string so the artifact stays JSON-serializable.
  if (/^[+-]?(inf|nan)$/.test(expr)) return expr;

  if (HEX_INT_RE.test(expr)) return parseInt(expr.slice(2).replace(/_/g, ''), 16);
  if (OCT_INT_RE.test(expr)) return parseInt(expr.slice(2).replace(/_/g, ''), 8);
  if (BIN_INT_RE.test(expr)) return parseInt(expr.slice(2).replace(/_/g, ''), 2);
  if (DEC_INT_RE.test(expr)) return Number(expr.replace(/_/g, ''));
  if (FLOAT_RE.test(expr) && /[.eE]/.test(expr)) return Number(expr.replace(/_/g, ''));

  throw new TomlParseError(`cannot parse value: ${expr}`);
}

function parseBasicString(expr: string): string {
  if (!expr.endsWith('"') || expr.length < 2) throw new TomlParseError('unterminated string');
  let out = '';
  for (let i = 1; i < expr.length - 1; i++) {
    const ch = expr[i] as string;
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const n = expr[++i];
    switch (n) {
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'r': out += '\r'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case '"': out += '"'; break;
      case '\\': out += '\\'; break;
      case 'u': out += readUnicodeEscape(expr, i + 1, 4); i += 4; break;
      case 'U': out += readUnicodeEscape(expr, i + 1, 8); i += 8; break;
      default: throw new TomlParseError(`invalid escape "\\${n ?? ''}"`);
    }
  }
  return out;
}

function readUnicodeEscape(s: string, start: number, len: number): string {
  const hex = s.slice(start, start + len);
  if (hex.length !== len || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new TomlParseError('invalid unicode escape');
  }
  return String.fromCodePoint(parseInt(hex, 16));
}

function parseLiteralString(expr: string): string {
  if (!expr.endsWith("'") || expr.length < 2) throw new TomlParseError('unterminated string');
  return expr.slice(1, -1);
}

function parseArray(expr: string): readonly TomlValue[] {
  if (!expr.endsWith(']')) throw new TomlUnsupportedError('multi-line array');
  const inner = expr.slice(1, -1).trim();
  if (inner === '') return [];
  return splitTopLevel(inner, ',').map((part) => parseValue(part.trim()));
}

function parseInlineTable(expr: string): { readonly [key: string]: TomlValue } {
  if (!expr.endsWith('}')) throw new TomlUnsupportedError('multi-line inline table');
  const inner = expr.slice(1, -1).trim();
  const obj: MutableTable = {};
  if (inner === '') return obj as { readonly [key: string]: TomlValue };
  for (const part of splitTopLevel(inner, ',')) {
    const trimmed = part.trim();
    if (trimmed === '') continue;
    const eq = findAssignEq(trimmed);
    if (eq < 0) throw new TomlParseError(`expected "key = value" in inline table: ${trimmed}`);
    const path = parseKeyPath(trimmed.slice(0, eq).trim());
    const value = parseValue(trimmed.slice(eq + 1).trim());
    let node = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i] as string;
      const next = node[key];
      if (next === undefined) {
        const created: MutableTable = {};
        node[key] = created;
        node = created;
      } else if (isPlainTable(next)) {
        node = next as MutableTable;
      } else {
        throw new TomlParseError(`"${key}" is not a table`);
      }
    }
    node[path[path.length - 1] as string] = value;
  }
  return obj as { readonly [key: string]: TomlValue };
}

// --- low-level scanning ----------------------------------------------------

/** Remove an inline `#` comment, respecting basic + literal string spans. */
function stripComment(line: string): string {
  let inBasic = false;
  let inLiteral = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inBasic) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inBasic = false;
    } else if (inLiteral) {
      if (ch === "'") inLiteral = false;
    } else if (ch === '"') {
      inBasic = true;
    } else if (ch === "'") {
      inLiteral = true;
    } else if (ch === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

/** Index of the first top-level `=` (outside strings/brackets/braces), or -1. */
function findAssignEq(s: string): number {
  let inBasic = false;
  let inLiteral = false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inBasic) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inBasic = false;
      continue;
    }
    if (inLiteral) {
      if (ch === "'") inLiteral = false;
      continue;
    }
    if (ch === '"') inBasic = true;
    else if (ch === "'") inLiteral = true;
    else if (ch === '[' || ch === '{') depth += 1;
    else if (ch === ']' || ch === '}') depth -= 1;
    else if (ch === '=' && depth === 0) return i;
  }
  return -1;
}

/** Split on a delimiter at bracket/brace depth 0, ignoring string contents. */
function splitTopLevel(s: string, delimiter: string): string[] {
  const parts: string[] = [];
  let inBasic = false;
  let inLiteral = false;
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inBasic) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inBasic = false;
      continue;
    }
    if (inLiteral) {
      if (ch === "'") inLiteral = false;
      continue;
    }
    if (ch === '"') inBasic = true;
    else if (ch === "'") inLiteral = true;
    else if (ch === '[' || ch === '{') depth += 1;
    else if (ch === ']' || ch === '}') depth -= 1;
    else if (ch === delimiter && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  const tail = s.slice(start);
  if (tail.trim() !== '' || parts.length === 0) parts.push(tail);
  return parts;
}

/** Parse a dotted key path, honoring quoted segments (`a."b.c".d`). */
function parseKeyPath(s: string): string[] {
  const segments: string[] = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i += 1;
    const ch = s[i];
    if (ch === '"' || ch === "'") {
      const close = ch;
      let j = i + 1;
      let seg = '';
      while (j < s.length && s[j] !== close) {
        if (close === '"' && s[j] === '\\') {
          seg += s[j] + (s[j + 1] ?? '');
          j += 2;
        } else {
          seg += s[j];
          j += 1;
        }
      }
      if (j >= s.length) throw new TomlParseError('unterminated quoted key');
      segments.push(close === '"' ? parseBasicString(`"${seg}"`) : seg);
      i = j + 1;
    } else {
      let j = i;
      while (j < s.length && s[j] !== '.') j += 1;
      const seg = s.slice(i, j).trim();
      if (seg === '') throw new TomlParseError('empty key segment');
      if (!/^[A-Za-z0-9_-]+$/.test(seg)) throw new TomlParseError(`invalid bare key "${seg}"`);
      segments.push(seg);
      i = j;
    }
    while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i += 1;
    if (i < s.length) {
      if (s[i] !== '.') throw new TomlParseError('expected "." between key segments');
      i += 1;
    }
  }
  if (segments.length === 0) throw new TomlParseError('empty key');
  return segments;
}

function isPlainTable(v: unknown): boolean {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// --- artifact plumbing -----------------------------------------------------

function invalidValue(): ParsedToml {
  return { valid: false, data: null, tableCount: 0, keyCount: 0 };
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: ParsedToml,
): TomlParsedArtifact {
  return {
    version: 1,
    kind: TOML_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
