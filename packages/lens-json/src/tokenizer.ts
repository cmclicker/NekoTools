/**
 * Phase 1.1c — in-tree JSON tokenizer.
 *
 * Produces a typed `JsonToken` stream with accurate offset / line /
 * column spans. **Does not validate structure** — that's still
 * `JSON.parse`'s job in `parser-text.ts`. The tokenizer's role is to
 * give the rest of NekoJSON something that knows *exactly* where each
 * piece of source text starts and ends, so diagnostics can highlight
 * the right region.
 *
 * What this PR uses it for:
 *   - `json.syntax_error` diagnostics get multi-character spans
 *     pointing at the offending token, instead of the one-character
 *     spans the V8 `position N` regex was producing.
 *
 * What follow-up PRs will use it for (Phase 1.1d):
 *   - `json.duplicate_key`   — walk the token stream, find object
 *                              scopes with the same string-token key
 *                              twice. Both occurrences' spans are
 *                              available.
 *   - `json.trailing_comma`  — find a `,` token immediately before
 *                              `]` or `}` in the stream.
 *
 * Scope guardrails (per the Phase 1.1c scope contract):
 *   - Strict JSON (RFC 8259). No comments, no trailing commas, no
 *     unquoted keys.
 *   - The tokenizer **must not** change which inputs the lens accepts
 *     or rejects — `JSON.parse` still decides validity.
 *   - On lexical error (unterminated string, malformed number,
 *     unexpected character) the tokenizer emits a `kind: 'error'`
 *     token, advances past the offending character, and continues.
 *     This is how we surface lexer-level problems with accurate spans
 *     without throwing.
 */

export interface JsonTokenSpan {
  readonly startOffset: number;
  readonly endOffset: number;
  /** 1-indexed line of `startOffset`. */
  readonly startLine: number;
  /** 1-indexed column of `startOffset`. */
  readonly startColumn: number;
  /** 1-indexed line of `endOffset` (exclusive). */
  readonly endLine: number;
  /** 1-indexed column of `endOffset` (exclusive). */
  readonly endColumn: number;
}

export type JsonTokenKind =
  | 'lbrace'
  | 'rbrace'
  | 'lbracket'
  | 'rbracket'
  | 'colon'
  | 'comma'
  | 'string'
  | 'number'
  | 'true'
  | 'false'
  | 'null'
  | 'error';

interface JsonTokenBase {
  readonly span: JsonTokenSpan;
}

export type JsonToken =
  | (JsonTokenBase & { readonly kind: 'lbrace' })
  | (JsonTokenBase & { readonly kind: 'rbrace' })
  | (JsonTokenBase & { readonly kind: 'lbracket' })
  | (JsonTokenBase & { readonly kind: 'rbracket' })
  | (JsonTokenBase & { readonly kind: 'colon' })
  | (JsonTokenBase & { readonly kind: 'comma' })
  | (JsonTokenBase & { readonly kind: 'string'; readonly raw: string; readonly value: string })
  | (JsonTokenBase & { readonly kind: 'number'; readonly raw: string; readonly value: number })
  | (JsonTokenBase & { readonly kind: 'true' })
  | (JsonTokenBase & { readonly kind: 'false' })
  | (JsonTokenBase & { readonly kind: 'null' })
  | (JsonTokenBase & { readonly kind: 'error'; readonly code: string; readonly message: string });

/**
 * Tokenize a JSON source string. Whitespace is consumed but not
 * emitted. The returned array is in source order.
 */
export function tokenize(source: string): readonly JsonToken[] {
  const tokens: JsonToken[] = [];
  const lineStarts = computeLineStarts(source);
  const ctx: Ctx = { source, pos: 0, lineStarts };

  while (ctx.pos < source.length) {
    skipWhitespace(ctx);
    if (ctx.pos >= source.length) break;

    const start = ctx.pos;
    const ch = source.charCodeAt(start);

    if (ch === 0x7b /* { */) {
      ctx.pos = start + 1;
      tokens.push({ kind: 'lbrace', span: spanFromTo(ctx, start, ctx.pos) });
    } else if (ch === 0x7d /* } */) {
      ctx.pos = start + 1;
      tokens.push({ kind: 'rbrace', span: spanFromTo(ctx, start, ctx.pos) });
    } else if (ch === 0x5b /* [ */) {
      ctx.pos = start + 1;
      tokens.push({ kind: 'lbracket', span: spanFromTo(ctx, start, ctx.pos) });
    } else if (ch === 0x5d /* ] */) {
      ctx.pos = start + 1;
      tokens.push({ kind: 'rbracket', span: spanFromTo(ctx, start, ctx.pos) });
    } else if (ch === 0x3a /* : */) {
      ctx.pos = start + 1;
      tokens.push({ kind: 'colon', span: spanFromTo(ctx, start, ctx.pos) });
    } else if (ch === 0x2c /* , */) {
      ctx.pos = start + 1;
      tokens.push({ kind: 'comma', span: spanFromTo(ctx, start, ctx.pos) });
    } else if (ch === 0x22 /* " */) {
      tokens.push(scanString(ctx, start));
    } else if (ch === 0x2d /* - */ || (ch >= 0x30 && ch <= 0x39) /* 0-9 */) {
      tokens.push(scanNumber(ctx, start));
    } else if (isKeywordStartChar(ch)) {
      // PR #6 audit blocker 4: scan the maximal contiguous ASCII
      // letter run, then check whether it *exactly* matches a JSON
      // literal keyword. This avoids the previous greedy behavior
      // where `truety` would emit `true` + error tokens, which would
      // mislead Phase 1.1d's token-stream walkers into seeing a
      // valid `true` literal at a position that is actually
      // structurally bogus. Now the entire malformed identifier
      // becomes one `tokenizer.invalid_keyword` error token.
      tokens.push(scanKeywordOrInvalid(ctx, start));
    } else {
      // Unrecognized character. Emit an error token covering exactly
      // this character, advance past it, and continue. This keeps the
      // tokenizer total — every input produces a finite token stream.
      ctx.pos = start + 1;
      tokens.push({
        kind: 'error',
        code: 'tokenizer.unexpected_char',
        message: `unexpected character ${JSON.stringify(source[start] ?? '')} at offset ${start}`,
        span: spanFromTo(ctx, start, ctx.pos),
      });
    }
  }

  return tokens;
}

interface Ctx {
  readonly source: string;
  pos: number;
  readonly lineStarts: readonly number[];
}

function skipWhitespace(ctx: Ctx): void {
  const { source } = ctx;
  while (ctx.pos < source.length) {
    const ch = source.charCodeAt(ctx.pos);
    // Per RFC 8259, whitespace is space, tab, LF, CR.
    if (ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x0d) {
      ctx.pos += 1;
      continue;
    }
    break;
  }
}

/**
 * `t`, `f`, `n` — the only ASCII letters that begin a JSON keyword.
 * Used as the dispatch cue from the main scanner before deciding
 * whether the maximal letter run is a valid keyword.
 */
function isKeywordStartChar(ch: number): boolean {
  return ch === 0x74 /* t */ || ch === 0x66 /* f */ || ch === 0x6e /* n */;
}

function isAsciiLetter(ch: number): boolean {
  return (ch >= 0x41 && ch <= 0x5a) || (ch >= 0x61 && ch <= 0x7a);
}

/**
 * Consumes the maximal contiguous ASCII letter run starting at
 * `start` and either emits a JSON literal keyword token (when the run
 * exactly matches `true` / `false` / `null`) or a single
 * `tokenizer.invalid_keyword` error token spanning the whole word.
 *
 * The single-error-token contract is important for Phase 1.1d's
 * token-stream walkers: a `kind: 'true' | 'false' | 'null'` token now
 * unambiguously means "valid JSON literal at this position." A
 * walker can stop checking for trailing identifier characters.
 */
function scanKeywordOrInvalid(ctx: Ctx, start: number): JsonToken {
  const { source } = ctx;
  let pos = start;
  while (pos < source.length && isAsciiLetter(source.charCodeAt(pos))) {
    pos += 1;
  }
  const word = source.slice(start, pos);
  ctx.pos = pos;
  const span = spanFromTo(ctx, start, pos);
  if (word === 'true') return { kind: 'true', span };
  if (word === 'false') return { kind: 'false', span };
  if (word === 'null') return { kind: 'null', span };
  return {
    kind: 'error',
    code: 'tokenizer.invalid_keyword',
    message: `invalid keyword "${word}" at offset ${start}; expected true / false / null`,
    span,
  };
}

function scanString(ctx: Ctx, start: number): JsonToken {
  // We've already seen the opening ".
  const { source } = ctx;
  ctx.pos = start + 1;
  let decoded = '';
  while (ctx.pos < source.length) {
    const ch = source.charCodeAt(ctx.pos);
    if (ch === 0x22 /* " */) {
      ctx.pos += 1;
      const span = spanFromTo(ctx, start, ctx.pos);
      return {
        kind: 'string',
        raw: source.slice(start, ctx.pos),
        value: decoded,
        span,
      };
    }
    if (ch === 0x5c /* \ */) {
      const escResult = scanEscape(ctx, ctx.pos);
      if (escResult.kind === 'error') {
        const errSpan = spanFromTo(ctx, escResult.spanStart, escResult.spanEnd);
        ctx.pos = escResult.spanEnd;
        return {
          kind: 'error',
          code: escResult.code,
          message: escResult.message,
          span: errSpan,
        };
      }
      decoded += escResult.text;
      ctx.pos = escResult.nextPos;
      continue;
    }
    if (ch < 0x20) {
      // Unescaped control character — invalid per RFC 8259.
      const span = spanFromTo(ctx, ctx.pos, ctx.pos + 1);
      const errPos = ctx.pos;
      ctx.pos += 1;
      return {
        kind: 'error',
        code: 'tokenizer.unescaped_control_char',
        message: `unescaped control character U+${ch.toString(16).padStart(4, '0').toUpperCase()} inside string at offset ${errPos}`,
        span,
      };
    }
    decoded += source[ctx.pos];
    ctx.pos += 1;
  }
  // EOF inside string.
  const span = spanFromTo(ctx, start, ctx.pos);
  return {
    kind: 'error',
    code: 'tokenizer.unterminated_string',
    message: `unterminated string literal starting at offset ${start}`,
    span,
  };
}

interface EscapeOk {
  readonly kind: 'ok';
  readonly text: string;
  readonly nextPos: number;
}
interface EscapeErr {
  readonly kind: 'error';
  readonly code: string;
  readonly message: string;
  readonly spanStart: number;
  readonly spanEnd: number;
}

function scanEscape(ctx: Ctx, at: number): EscapeOk | EscapeErr {
  const { source } = ctx;
  // `at` points at the backslash.
  if (at + 1 >= source.length) {
    return {
      kind: 'error',
      code: 'tokenizer.unterminated_escape',
      message: `escape sequence terminated by EOF at offset ${at}`,
      spanStart: at,
      spanEnd: source.length,
    };
  }
  const next = source[at + 1] ?? '';
  switch (next) {
    case '"':
      return { kind: 'ok', text: '"', nextPos: at + 2 };
    case '\\':
      return { kind: 'ok', text: '\\', nextPos: at + 2 };
    case '/':
      return { kind: 'ok', text: '/', nextPos: at + 2 };
    case 'b':
      return { kind: 'ok', text: '\b', nextPos: at + 2 };
    case 'f':
      return { kind: 'ok', text: '\f', nextPos: at + 2 };
    case 'n':
      return { kind: 'ok', text: '\n', nextPos: at + 2 };
    case 'r':
      return { kind: 'ok', text: '\r', nextPos: at + 2 };
    case 't':
      return { kind: 'ok', text: '\t', nextPos: at + 2 };
    case 'u': {
      const hex = source.slice(at + 2, at + 6);
      if (hex.length !== 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
        return {
          kind: 'error',
          code: 'tokenizer.invalid_unicode_escape',
          message: `\\u escape must be followed by 4 hex digits at offset ${at}`,
          spanStart: at,
          spanEnd: Math.min(at + 6, source.length),
        };
      }
      return {
        kind: 'ok',
        text: String.fromCharCode(parseInt(hex, 16)),
        nextPos: at + 6,
      };
    }
    default:
      return {
        kind: 'error',
        code: 'tokenizer.invalid_escape',
        message: `invalid escape sequence "\\${next}" at offset ${at}`,
        spanStart: at,
        spanEnd: at + 2,
      };
  }
}

function scanNumber(ctx: Ctx, start: number): JsonToken {
  const { source } = ctx;
  let pos = start;

  if (source.charCodeAt(pos) === 0x2d /* - */) pos += 1;

  // Integer part: 0 OR (1-9)(0-9)*
  if (pos < source.length && source.charCodeAt(pos) === 0x30 /* 0 */) {
    pos += 1;
    // PR #6 audit blocker 3: JSON forbids a leading zero followed by
    // another digit (`01`, `-01`, `00`, etc.). Consume all trailing
    // digits and emit ONE `invalid_number` error token spanning the
    // whole malformed run. This matches the auditor's preferred fix
    // and keeps the token stream unambiguous for Phase 1.1d walkers.
    if (pos < source.length) {
      const next = source.charCodeAt(pos);
      if (next >= 0x30 && next <= 0x39) {
        while (pos < source.length) {
          const c = source.charCodeAt(pos);
          if (c < 0x30 || c > 0x39) break;
          pos += 1;
        }
        const span = spanFromTo(ctx, start, pos);
        ctx.pos = pos;
        return {
          kind: 'error',
          code: 'tokenizer.invalid_number',
          message: `invalid number at offset ${start}: leading zero followed by digit ("${source.slice(start, pos)}")`,
          span,
        };
      }
    }
  } else if (pos < source.length && source.charCodeAt(pos) >= 0x31 && source.charCodeAt(pos) <= 0x39) {
    pos += 1;
    while (pos < source.length) {
      const c = source.charCodeAt(pos);
      if (c < 0x30 || c > 0x39) break;
      pos += 1;
    }
  } else {
    const span = spanFromTo(ctx, start, start + 1);
    ctx.pos = start + 1;
    return {
      kind: 'error',
      code: 'tokenizer.invalid_number',
      message: `invalid number at offset ${start}: expected digit`,
      span,
    };
  }

  // Fractional part: .digits+
  if (pos < source.length && source.charCodeAt(pos) === 0x2e /* . */) {
    pos += 1;
    const fracStart = pos;
    while (pos < source.length) {
      const c = source.charCodeAt(pos);
      if (c < 0x30 || c > 0x39) break;
      pos += 1;
    }
    if (pos === fracStart) {
      const span = spanFromTo(ctx, start, pos);
      ctx.pos = pos;
      return {
        kind: 'error',
        code: 'tokenizer.invalid_number',
        message: `invalid number at offset ${start}: expected digit after "."`,
        span,
      };
    }
  }

  // Exponent: [eE][+-]?digits+
  if (pos < source.length) {
    const c = source.charCodeAt(pos);
    if (c === 0x65 /* e */ || c === 0x45 /* E */) {
      pos += 1;
      const expSign = source.charCodeAt(pos);
      if (expSign === 0x2b /* + */ || expSign === 0x2d /* - */) pos += 1;
      const expDigitStart = pos;
      while (pos < source.length) {
        const cc = source.charCodeAt(pos);
        if (cc < 0x30 || cc > 0x39) break;
        pos += 1;
      }
      if (pos === expDigitStart) {
        const span = spanFromTo(ctx, start, pos);
        ctx.pos = pos;
        return {
          kind: 'error',
          code: 'tokenizer.invalid_number',
          message: `invalid number at offset ${start}: expected digit in exponent`,
          span,
        };
      }
    }
  }

  const raw = source.slice(start, pos);
  const value = Number(raw);
  ctx.pos = pos;
  return {
    kind: 'number',
    raw,
    value,
    span: spanFromTo(ctx, start, pos),
  };
}

function spanFromTo(ctx: Ctx, start: number, end: number): JsonTokenSpan {
  const { line: startLine, column: startColumn } = locationAt(ctx.lineStarts, start);
  const { line: endLine, column: endColumn } = locationAt(ctx.lineStarts, end);
  return { startOffset: start, endOffset: end, startLine, startColumn, endLine, endColumn };
}

function computeLineStarts(source: string): readonly number[] {
  const starts: number[] = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source.charCodeAt(i) === 0x0a /* LF */) {
      starts.push(i + 1);
    }
  }
  return starts;
}

function locationAt(starts: readonly number[], offset: number): { line: number; column: number } {
  // Find the largest starts[i] <= offset via binary search.
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if ((starts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  const lineStart = starts[lo] ?? 0;
  return { line: lo + 1, column: offset - lineStart + 1 };
}

/**
 * Convenience: find the first `kind: 'error'` token in a stream, or
 * undefined if there is none.
 */
export function findFirstErrorToken(tokens: readonly JsonToken[]): JsonToken | undefined {
  for (const t of tokens) {
    if (t.kind === 'error') return t;
  }
  return undefined;
}

/**
 * Convenience: find the token whose span contains `offset` (closest
 * non-error token if multiple contain it; first wins). Returns
 * `undefined` if no token contains the offset.
 */
export function findTokenAt(
  tokens: readonly JsonToken[],
  offset: number,
): JsonToken | undefined {
  for (const t of tokens) {
    if (offset >= t.span.startOffset && offset < t.span.endOffset) {
      return t;
    }
  }
  return undefined;
}
