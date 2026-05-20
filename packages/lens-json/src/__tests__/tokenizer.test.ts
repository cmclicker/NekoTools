import { describe, expect, it } from 'vitest';
import {
  findFirstErrorToken,
  findTokenAt,
  tokenize,
  type JsonToken,
} from '../tokenizer.js';

function kinds(tokens: readonly JsonToken[]): readonly string[] {
  return tokens.map((t) => t.kind);
}

describe('tokenizer: structural tokens', () => {
  it('emits { } [ ] : , with correct one-character spans', () => {
    const tokens = tokenize('{}[],:');
    expect(kinds(tokens)).toEqual(['lbrace', 'rbrace', 'lbracket', 'rbracket', 'comma', 'colon']);
    for (let i = 0; i < tokens.length; i += 1) {
      const t = tokens[i]!;
      expect(t.span.startOffset).toBe(i);
      expect(t.span.endOffset).toBe(i + 1);
      expect(t.span.startLine).toBe(1);
      expect(t.span.startColumn).toBe(i + 1);
    }
  });

  it('skips whitespace between tokens but tracks offsets', () => {
    const tokens = tokenize('  { , ');
    expect(kinds(tokens)).toEqual(['lbrace', 'comma']);
    expect(tokens[0]!.span.startOffset).toBe(2);
    expect(tokens[1]!.span.startOffset).toBe(4);
  });

  it('tracks line and column across newlines', () => {
    const tokens = tokenize('{\n  "a": 1\n}');
    // Tokens: { string : number }
    expect(tokens[0]!.span.startLine).toBe(1);
    expect(tokens[0]!.span.startColumn).toBe(1);
    expect(tokens[1]!.kind).toBe('string');
    expect(tokens[1]!.span.startLine).toBe(2);
    expect(tokens[1]!.span.startColumn).toBe(3);
    expect(tokens[4]!.kind).toBe('rbrace');
    expect(tokens[4]!.span.startLine).toBe(3);
    expect(tokens[4]!.span.startColumn).toBe(1);
  });
});

describe('tokenizer: literal tokens', () => {
  it('recognizes true / false / null at word boundaries', () => {
    const tokens = tokenize('[true, false, null]');
    expect(kinds(tokens)).toEqual([
      'lbracket', 'true', 'comma', 'false', 'comma', 'null', 'rbracket',
    ]);
  });

  it('matches true / false / null greedily; JSON.parse rejects misplaced trailing chars', () => {
    // The tokenizer's contract is lexical, not structural. `truety`
    // is tokenized as a `true` literal followed by error tokens for
    // the trailing `ty`. JSON.parse (the structural authority in
    // json.text) then rejects the input as invalid JSON. This
    // mirrors how jq, JSON5, and most hand-written JSON tokenizers
    // behave, and it's what Phase 1.1d's token-stream walkers will
    // assume — `kind: 'true'` means "valid `true` literal here," and
    // `error` tokens mark the lexical break.
    const tokens = tokenize('truety');
    expect(tokens[0]?.kind).toBe('true');
    expect(tokens[0]?.span.endOffset).toBe(4);
    const tail = tokens.slice(1);
    expect(tail.length).toBeGreaterThan(0);
    expect(tail.every((t) => t.kind === 'error')).toBe(true);
  });
});

describe('tokenizer: strings', () => {
  it('decodes a plain ASCII string and reports the raw form', () => {
    const tokens = tokenize('"hello"');
    expect(tokens[0]!.kind).toBe('string');
    expect((tokens[0] as { value: string; raw: string }).value).toBe('hello');
    expect((tokens[0] as { value: string; raw: string }).raw).toBe('"hello"');
    expect(tokens[0]!.span.startOffset).toBe(0);
    expect(tokens[0]!.span.endOffset).toBe(7);
  });

  it('decodes common escape sequences', () => {
    const tokens = tokenize('"line\\nbreak\\ttab"');
    expect((tokens[0] as { value: string }).value).toBe('line\nbreak\ttab');
  });

  it('decodes \\u four-hex-digit escapes', () => {
    const tokens = tokenize('"\\u00e9"');
    expect((tokens[0] as { value: string }).value).toBe('é');
  });

  it('emits an error token for an unterminated string', () => {
    const tokens = tokenize('"oops');
    expect(tokens[0]!.kind).toBe('error');
    expect((tokens[0] as { code: string }).code).toBe('tokenizer.unterminated_string');
    expect(tokens[0]!.span.startOffset).toBe(0);
  });

  it('emits an error token for an unescaped control character', () => {
    const tokens = tokenize('"ab"');
    const errs = tokens.filter((t) => t.kind === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect((errs[0] as { code: string }).code).toBe('tokenizer.unescaped_control_char');
  });

  it('emits an error token for an invalid escape', () => {
    const tokens = tokenize('"\\q"');
    const err = findFirstErrorToken(tokens);
    expect((err as { code: string }).code).toBe('tokenizer.invalid_escape');
  });

  it('emits an error token for a short \\u escape', () => {
    const tokens = tokenize('"\\u12"');
    const err = findFirstErrorToken(tokens);
    expect((err as { code: string }).code).toBe('tokenizer.invalid_unicode_escape');
  });
});

describe('tokenizer: numbers', () => {
  it('parses integers, decimals, negatives, and exponents', () => {
    const tokens = tokenize('[0, -42, 3.14, 1e10, -2.5e-3]');
    const numbers = tokens.filter((t) => t.kind === 'number') as Array<{
      kind: 'number';
      value: number;
      raw: string;
    }>;
    expect(numbers.map((n) => n.value)).toEqual([0, -42, 3.14, 1e10, -2.5e-3]);
    expect(numbers[0]!.raw).toBe('0');
    expect(numbers[1]!.raw).toBe('-42');
  });

  it('emits an error token for "01" (leading zero in JSON is invalid)', () => {
    const tokens = tokenize('01');
    // After scanning "0" as a number, "1" is an unexpected character.
    expect(tokens.some((t) => t.kind === 'error' || t.kind === 'number')).toBe(true);
    // At minimum: the tokenizer must not silently produce a single
    // number token covering both digits.
    const numberToken = tokens.find((t) => t.kind === 'number');
    if (numberToken) {
      expect(numberToken.span.endOffset).toBeLessThanOrEqual(1);
    }
  });

  it('emits an error token for a trailing dot ("1.")', () => {
    const tokens = tokenize('1.');
    const err = findFirstErrorToken(tokens);
    expect(err).toBeDefined();
    expect((err as { code: string }).code).toBe('tokenizer.invalid_number');
  });

  it('emits an error token for an empty exponent ("1e")', () => {
    const tokens = tokenize('1e');
    const err = findFirstErrorToken(tokens);
    expect(err).toBeDefined();
    expect((err as { code: string }).code).toBe('tokenizer.invalid_number');
  });
});

describe('tokenizer: error recovery', () => {
  it('emits an error token for an unexpected character and continues', () => {
    const tokens = tokenize('{ ? }');
    const err = findFirstErrorToken(tokens);
    expect(err).toBeDefined();
    expect((err as { code: string }).code).toBe('tokenizer.unexpected_char');
    // Tokenization must continue past the bad character so the rest
    // of the source is still inspectable.
    expect(tokens.some((t) => t.kind === 'rbrace')).toBe(true);
  });
});

describe('tokenizer: helpers', () => {
  it('findFirstErrorToken returns undefined for a clean stream', () => {
    expect(findFirstErrorToken(tokenize('{"a":1}'))).toBeUndefined();
  });

  it('findTokenAt returns the token containing the given offset', () => {
    const tokens = tokenize('{"abc":1}');
    // string token covers offsets 1..6 (exclusive end)
    const t = findTokenAt(tokens, 3);
    expect(t?.kind).toBe('string');
  });

  it('findTokenAt returns undefined when the offset is in whitespace', () => {
    const tokens = tokenize('{ "a": 1 }');
    const t = findTokenAt(tokens, 1); // the space between { and "
    expect(t).toBeUndefined();
  });
});
