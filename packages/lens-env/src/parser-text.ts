import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';

import {
  DEFAULT_LARGE_DOCUMENT_BYTES,
  ENV_DIAGNOSTIC_CODES,
  makeDiagnostic,
} from './diagnostics.js';
import {
  ENV_KIND_DOCUMENT,
  type EnvArtifact,
  type EnvDocument,
  type EnvDocumentArtifact,
  type EnvEntry,
  type EnvLine,
} from './kinds.js';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

const TOOL_ID = 'env';
const PARSER_ID = 'env.text';

interface ParserDeps {
  readonly clock: Clock;
  /** Soft size threshold for emitting `env.large_document`. Defaults
   * to `DEFAULT_LARGE_DOCUMENT_BYTES` (10 MB). */
  readonly largeDocumentBytes?: number;
}

const KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Permissive entry shape: `(optional whitespace)(optional export)(key)=(rest)`. */
const ENTRY_LINE_REGEX = /^(\s*)(export\s+)?(\S+?)\s*=(.*)$/;
/** Detects interpolation tokens in a decoded value. */
const INTERPOLATION_REGEX = /\$(?:\{[^}]*\}|\([^)]*\)|[A-Za-z_][A-Za-z0-9_]*)/;

/**
 * The Phase 2.1 `env.text` parser.
 *
 * Line-oriented scan with one cross-line state: a double- or single-
 * quoted value whose opening quote does not close on the same line
 * spans subsequent lines until the matching closing quote. This is
 * the standard dotenv convention used by every common loader.
 *
 * `JSON.parse` is the source of truth for JSON; for dotenv the source
 * of truth is this scanner. There is no separate validity oracle. The
 * scanner never throws — every malformed input produces structured
 * diagnostics and (where possible) a best-effort artifact.
 *
 * All offsets in spans are JS string offsets into `input.raw`, not
 * UTF-8 byte offsets. The byte-length / large-document check uses
 * `TextEncoder` so the threshold name (`largeDocumentBytes`) is
 * honest for non-ASCII payloads.
 */
export function createEnvTextParser(deps: ParserDeps): Parser<EnvArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text', 'env', 'dotenv'],
    produces: [ENV_KIND_DOCUMENT],
    parse(input: ParserInput): ParserResult<EnvArtifact> {
      return parseEnvText(input, deps);
    },
  };
}

function parseEnvText(
  input: ParserInput,
  deps: ParserDeps,
): ParserResult<EnvArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const diagnostics: Diagnostic[] = [];

  const raw = input.raw;
  const lineStarts = computeLineStarts(raw);
  const sourceLines = splitLines(raw);

  const entries: EnvEntry[] = [];
  const lines: EnvLine[] = [];
  const seenKeys = new Map<string, { line: number }>();

  let i = 0;
  while (i < sourceLines.length) {
    const rawLine = sourceLines[i]!;
    const lineNo = i + 1;
    const lineOffset = lineStarts[i] ?? 0;

    if (isBlank(rawLine)) {
      lines.push({ kind: 'blank', line: lineNo });
      i += 1;
      continue;
    }

    const trimmedLeft = rawLine.replace(/^\s+/, '');
    if (trimmedLeft.startsWith('#')) {
      // Strip the `#` and any single leading space — the canonical
      // re-emit will re-add `# `. We keep the rest verbatim so
      // documentation-style comments round-trip.
      const text = trimmedLeft.slice(1).replace(/^ /, '');
      lines.push({ kind: 'comment', text, line: lineNo });
      i += 1;
      continue;
    }

    const entryMatch = ENTRY_LINE_REGEX.exec(rawLine);
    if (!entryMatch) {
      // Not blank, not comment, not entry-shaped. Surface as a
      // syntax error pointing at the whole line.
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'error',
          ENV_DIAGNOSTIC_CODES.syntaxError,
          `line ${lineNo} is not a valid dotenv entry (expected KEY=VALUE, # comment, or blank)`,
          spanForLine(lineOffset, rawLine.length, lineNo),
        ),
      );
      lines.push({ kind: 'malformed', text: rawLine, line: lineNo });
      i += 1;
      continue;
    }

    const leadingWhitespace = entryMatch[1] ?? '';
    const exportPrefix = (entryMatch[2] ?? '').length > 0;
    const key = entryMatch[3] ?? '';
    const valuePortion = entryMatch[4] ?? '';

    const keyStartOffset =
      lineOffset + leadingWhitespace.length + (entryMatch[2] ?? '').length;

    if (exportPrefix) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          ENV_DIAGNOSTIC_CODES.shellExportPrefix,
          `line ${lineNo} uses "export " prefix; most dotenv loaders ignore it, behavior may differ from your shell`,
          { startOffset: lineOffset + leadingWhitespace.length, endOffset: keyStartOffset, startLine: lineNo, startColumn: leadingWhitespace.length + 1 },
        ),
      );
    }

    if (!KEY_REGEX.test(key)) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'error',
          ENV_DIAGNOSTIC_CODES.invalidKey,
          `key "${key}" is not a shell-portable identifier (expected [A-Za-z_][A-Za-z0-9_]*)`,
          { startOffset: keyStartOffset, endOffset: keyStartOffset + key.length, startLine: lineNo, startColumn: keyStartOffset - lineOffset + 1 },
        ),
      );
    }

    // Locate where the value portion actually starts in the source —
    // for span tracking on unterminated quotes etc.
    const valueLeadingWs = (/^\s*/.exec(valuePortion)?.[0] ?? '').length;
    const valueStartOffset =
      lineOffset + (rawLine.length - valuePortion.length) + valueLeadingWs;
    const valueText = valuePortion.slice(valueLeadingWs);

    const parsedValue = parseValuePortion(
      valueText,
      sourceLines,
      lineNo,
      valueStartOffset,
      lineStarts,
      raw.length,
    );

    if (parsedValue.kind === 'trailing-garbage') {
      // Best-effort: produce the entry with the decoded value so the
      // user can see what was parsed, but surface a syntax error
      // pointing at the garbage. Per PR #13 audit blocker 1: silently
      // dropping trailing text violates the charter's strict-parser
      // posture.
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'error',
          ENV_DIAGNOSTIC_CODES.syntaxError,
          `unexpected text after ${parsedValue.quoting === 'double' ? 'double' : 'single'}-quoted value for "${key}" on line ${parsedValue.endLine}: ${JSON.stringify(parsedValue.garbage)}`,
          spanForLine(
            lineStarts[parsedValue.endLine - 1] ?? lineOffset,
            sourceLines[parsedValue.endLine - 1]?.length ?? 0,
            parsedValue.endLine,
          ),
        ),
      );
      const entry: EnvEntry = {
        key,
        value: parsedValue.value,
        quoting: parsedValue.quoting,
        exportPrefix,
        startLine: lineNo,
        endLine: parsedValue.endLine,
      };
      recordEntry(entry, entries, lines, seenKeys, diagnostics, diagIds, lineNo);
      i = parsedValue.endLine;
      continue;
    }

    if (parsedValue.kind === 'unterminated') {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'error',
          ENV_DIAGNOSTIC_CODES.unterminatedQuote,
          `unterminated ${parsedValue.quote === '"' ? 'double-quoted' : 'single-quoted'} value for "${key}" (opened at line ${lineNo})`,
          {
            startOffset: valueStartOffset,
            endOffset: Math.min(raw.length, valueStartOffset + 1),
            startLine: lineNo,
            startColumn: valueStartOffset - lineOffset + 1,
          },
        ),
      );
      // Best-effort recovery: take everything from the opening quote
      // to end-of-input as the value, single-line. Then stop scanning
      // — we'd otherwise mis-attribute later content.
      const recoveredValue = raw.slice(valueStartOffset + 1);
      const entry: EnvEntry = {
        key,
        value: recoveredValue,
        quoting: parsedValue.quote === '"' ? 'double' : 'single',
        exportPrefix,
        startLine: lineNo,
        endLine: sourceLines.length,
      };
      recordEntry(entry, entries, lines, seenKeys, diagnostics, diagIds, lineNo);
      i = sourceLines.length;
      continue;
    }

    const entry: EnvEntry = parsedValue.trailingComment !== undefined
      ? {
          key,
          value: parsedValue.value,
          quoting: parsedValue.quoting,
          exportPrefix,
          trailingComment: parsedValue.trailingComment,
          startLine: lineNo,
          endLine: parsedValue.endLine,
        }
      : {
          key,
          value: parsedValue.value,
          quoting: parsedValue.quoting,
          exportPrefix,
          startLine: lineNo,
          endLine: parsedValue.endLine,
        };
    recordEntry(entry, entries, lines, seenKeys, diagnostics, diagIds, lineNo);

    if (INTERPOLATION_REGEX.test(entry.value)) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'info',
          ENV_DIAGNOSTIC_CODES.interpolationToken,
          `value for "${key}" contains an interpolation token ($VAR / \${VAR} / $(cmd)); NekoEnv does not expand it — your loader will at runtime`,
          {
            startOffset: valueStartOffset,
            endOffset: lineStarts[parsedValue.endLine - 1] !== undefined && parsedValue.endLine - 1 < sourceLines.length
              ? (lineStarts[parsedValue.endLine - 1]! + (sourceLines[parsedValue.endLine - 1]?.length ?? 0))
              : raw.length,
            startLine: lineNo,
            endLine: parsedValue.endLine,
          },
        ),
      );
    }

    i = parsedValue.endLine; // 1-indexed end line maps to 0-indexed `i = endLine` for next iteration
  }

  // Empty / comments-only input policy (charter §3): always produce
  // an artifact; emit `env.empty_input` at info severity when there
  // are no entries. The artifact is still useful in the workbench
  // (preserved comments / blank lines for editing).
  if (entries.length === 0) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        ENV_DIAGNOSTIC_CODES.emptyInput,
        raw.trim() === ''
          ? 'input is empty'
          : 'input contains only comments and/or blank lines (zero entries)',
      ),
    );
  }

  // Soft-threshold info diagnostic, parallel to NekoJSON's. Measured
  // as UTF-8 byte length so non-ASCII payloads count honestly against
  // the named "*Bytes" threshold.
  const threshold = deps.largeDocumentBytes ?? DEFAULT_LARGE_DOCUMENT_BYTES;
  const actualBytes = utf8ByteLength(raw);
  if (actualBytes > threshold) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        ENV_DIAGNOSTIC_CODES.largeDocument,
        `document is ${actualBytes} bytes; exceeds soft threshold of ${threshold} bytes — some heavy operations may be gated`,
      ),
    );
  }

  const document: EnvDocument = { entries, lines };
  const artifact: EnvDocumentArtifact = {
    version: 1,
    kind: ENV_KIND_DOCUMENT,
    id: artIds(),
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt: deps.clock.now(),
    source: input.source,
    value: document,
  };
  return { artifacts: [artifact], diagnostics };
}

interface ValueParseOk {
  readonly kind: 'ok';
  readonly value: string;
  readonly quoting: 'none' | 'single' | 'double';
  readonly trailingComment?: string;
  readonly endLine: number;
}
interface ValueParseUnterminated {
  readonly kind: 'unterminated';
  readonly quote: '"' | "'";
}
interface ValueParseTrailingGarbage {
  readonly kind: 'trailing-garbage';
  readonly value: string;
  readonly quoting: 'single' | 'double';
  readonly endLine: number;
  readonly garbage: string;
}
type ValueParseResult =
  | ValueParseOk
  | ValueParseUnterminated
  | ValueParseTrailingGarbage;

/**
 * Parse the value portion of an entry line. Handles three shapes:
 *
 *   - Double-quoted (`"..."`): standard `\n`, `\r`, `\t`, `\"`, `\\`
 *     escape processing. Spans multiple source lines if the closing
 *     `"` is not on the opening line.
 *   - Single-quoted (`'...'`): literal body, no escape processing.
 *     Also spans multiple lines until the closing `'`.
 *   - Unquoted: trimmed leading/trailing whitespace; trailing
 *     `# comment` (when preceded by whitespace) is split off into
 *     `trailingComment`.
 */
function parseValuePortion(
  valueText: string,
  sourceLines: readonly string[],
  startLineNo: number,
  _valueStartOffset: number,
  _lineStarts: readonly number[],
  _rawLen: number,
): ValueParseResult {
  if (valueText.startsWith('"')) {
    return parseQuotedValue(valueText, sourceLines, startLineNo, '"', true);
  }
  if (valueText.startsWith("'")) {
    return parseQuotedValue(valueText, sourceLines, startLineNo, "'", false);
  }
  // Unquoted: split off trailing comment (only when preceded by
  // whitespace or at start of value — `KEY=foo#bar` is conventionally
  // a literal value of `foo#bar`, not `foo` + comment `bar`).
  const commentMatch = /^([^#]*?)(\s+#.*)?$/.exec(valueText);
  const bodyRaw = commentMatch?.[1] ?? valueText;
  const commentPart = commentMatch?.[2];
  const body = bodyRaw.replace(/\s+$/, '');
  if (commentPart) {
    const trailingComment = commentPart.replace(/^\s+#\s?/, '');
    return { kind: 'ok', value: body, quoting: 'none', trailingComment, endLine: startLineNo };
  }
  return { kind: 'ok', value: body, quoting: 'none', endLine: startLineNo };
}

function parseQuotedValue(
  valueText: string,
  sourceLines: readonly string[],
  startLineNo: number,
  quote: '"' | "'",
  processEscapes: boolean,
): ValueParseResult {
  // Walk the buffer character-by-character starting after the opening
  // quote, collecting decoded characters. If we hit end-of-line and
  // have not closed the quote, advance to the next source line and
  // re-enter the scanner with a literal `\n` separator added to the
  // decoded body.
  let lineIdx = startLineNo - 1;
  let current = valueText.slice(1); // skip opening quote
  let out = '';

  for (;;) {
    let j = 0;
    while (j < current.length) {
      const ch = current[j]!;
      if (processEscapes && ch === '\\') {
        const next = current[j + 1];
        if (next === undefined) {
          // Trailing backslash at end of line within a "..." value —
          // dotenv convention treats this as a literal backslash. We
          // also keep the line break (we'll add it below when we
          // advance lineIdx).
          out += '\\';
          j += 1;
          continue;
        }
        out += decodeEscape(next);
        j += 2;
        continue;
      }
      if (ch === quote) {
        // Closing quote. Anything after must be whitespace and/or a
        // `# comment`. Trailing non-comment text is malformed —
        // silently dropping it would be a strict-parser failure
        // (per the PR #13 audit blocker 1).
        const remainder = current.slice(j + 1);
        const trailComment = /^\s+#\s?(.*)$/.exec(remainder);
        if (trailComment) {
          return {
            kind: 'ok',
            value: out,
            quoting: quote === '"' ? 'double' : 'single',
            trailingComment: trailComment[1] ?? '',
            endLine: lineIdx + 1,
          };
        }
        if (remainder === '' || /^\s*$/.test(remainder)) {
          return {
            kind: 'ok',
            value: out,
            quoting: quote === '"' ? 'double' : 'single',
            endLine: lineIdx + 1,
          };
        }
        // Anything else is trailing garbage — surface it so the
        // caller can emit `env.syntax_error`. We still return the
        // decoded value as a best-effort artifact so the user can
        // see what was parsed before fixing the line.
        return {
          kind: 'trailing-garbage',
          value: out,
          quoting: quote === '"' ? 'double' : 'single',
          endLine: lineIdx + 1,
          garbage: remainder,
        };
      }
      out += ch;
      j += 1;
    }
    // End of current line with no closing quote. Advance.
    lineIdx += 1;
    if (lineIdx >= sourceLines.length) {
      return { kind: 'unterminated', quote };
    }
    out += '\n';
    current = sourceLines[lineIdx] ?? '';
  }
}

function decodeEscape(ch: string): string {
  switch (ch) {
    case 'n':
      return '\n';
    case 'r':
      return '\r';
    case 't':
      return '\t';
    case 'b':
      return '\b';
    case 'f':
      return '\f';
    case '"':
      return '"';
    case "'":
      return "'";
    case '\\':
      return '\\';
    case '$':
      return '$';
    default:
      // Unknown escape — leave the backslash in place; this matches
      // the "be conservative on output, surface as info diagnostic if
      // it ever becomes load-bearing" rule. Returning `\\` + ch keeps
      // the original text intact.
      return `\\${ch}`;
  }
}

function recordEntry(
  entry: EnvEntry,
  entries: EnvEntry[],
  lines: EnvLine[],
  seenKeys: Map<string, { line: number }>,
  diagnostics: Diagnostic[],
  diagIds: () => string,
  lineNo: number,
): void {
  const idx = entries.length;
  entries.push(entry);
  lines.push({ kind: 'entry', entryIndex: idx, line: lineNo, endLine: entry.endLine });

  const seen = seenKeys.get(entry.key);
  if (seen !== undefined) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'warning',
        ENV_DIAGNOSTIC_CODES.duplicateKey,
        `key "${entry.key}" appears again at line ${lineNo} (first occurrence at line ${seen.line}); most dotenv loaders keep the last value`,
      ),
    );
  } else {
    seenKeys.set(entry.key, { line: lineNo });
  }
}

function computeLineStarts(raw: string): readonly number[] {
  const starts: number[] = [0];
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function splitLines(raw: string): readonly string[] {
  // Split on `\n`; if the input ends with `\n`, an extra empty
  // element appears at the end — drop it so trailing-newline files
  // are not flagged as malformed. CRLF is normalized by stripping
  // trailing `\r` from each line so column math stays sane.
  const parts = raw.split('\n').map((p) => (p.endsWith('\r') ? p.slice(0, -1) : p));
  if (parts.length > 0 && parts[parts.length - 1] === '' && raw.endsWith('\n')) {
    parts.pop();
  }
  return parts;
}

function isBlank(line: string): boolean {
  return /^\s*$/.test(line);
}

function spanForLine(
  lineOffset: number,
  lineLen: number,
  lineNo: number,
): Diagnostic['span'] {
  return {
    startOffset: lineOffset,
    endOffset: lineOffset + lineLen,
    startLine: lineNo,
    startColumn: 1,
    endLine: lineNo,
    endColumn: lineLen + 1,
  };
}

const SHARED_UTF8_ENCODER = new TextEncoder();
function utf8ByteLength(s: string): number {
  return SHARED_UTF8_ENCODER.encode(s).byteLength;
}
