import type { Diagnostic } from '@nekotools/contracts';

import { JSON_DIAGNOSTIC_CODES, makeDiagnostic } from './diagnostics.js';
import type { JsonToken, JsonTokenSpan } from './tokenizer.js';

/**
 * Phase 1.1d — token-stream walker that emits two diagnostics the
 * `JSON.parse` happy path can't surface:
 *
 *   - `json.duplicate_key` (warning) — an object has the same key
 *     twice. `JSON.parse` silently keeps the last value; the warning
 *     points at the second (and any later) occurrence and references
 *     the first occurrence's line/column in the message.
 *   - `json.trailing_comma` (warning) — a `,` token appears
 *     immediately before `}` or `]`. Strict JSON rejects this; the
 *     warning makes the cause explicit so a future non-strict mode
 *     can also surface it cleanly.
 *
 * The walker is intentionally conservative:
 *
 *   - It only emits `duplicate_key` when the containing object scope
 *     closes cleanly with `}`. Unclosed scopes are JSON.parse's
 *     business — emitting duplicate-key on an unclosed object would
 *     just add noise to the inevitable syntax error.
 *   - It skips `kind: 'error'` tokens when tracking "previous
 *     non-error token" for key-position detection. A malformed slice
 *     in the middle of an object shouldn't suppress a real duplicate
 *     elsewhere in the same object.
 *   - It does not touch `JSON.parse`'s validity decision. The
 *     walker's diagnostics ride alongside the existing
 *     `json.syntax_error` / `json.document` artifact path.
 */
export function walkForDiagnostics(
  tokens: readonly JsonToken[],
  makeDiagId: () => string,
): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  const scopes: Scope[] = [];
  let prevNonError: JsonToken | undefined;

  for (const t of tokens) {
    // Trailing-comma detection (must run *before* we mutate the
    // scope stack on close tokens, because it consults prevNonError
    // which still points at the preceding non-error token).
    if (
      (t.kind === 'rbrace' || t.kind === 'rbracket') &&
      prevNonError?.kind === 'comma'
    ) {
      out.push(
        makeDiagnostic(
          makeDiagId(),
          'warning',
          JSON_DIAGNOSTIC_CODES.trailingComma,
          `trailing comma before ${t.kind === 'rbrace' ? '"}"' : '"]"'}`,
          prevNonError.span,
          'strict JSON forbids commas immediately before "]" or "}". Remove the comma to make the input valid JSON.',
        ),
      );
    }

    switch (t.kind) {
      case 'lbrace':
        scopes.push({ kind: 'object', keys: new Map<string, JsonTokenSpan[]>() });
        break;
      case 'lbracket':
        scopes.push({ kind: 'array' });
        break;
      case 'rbrace': {
        const popped = scopes.pop();
        // Emit duplicate-key only on a clean object close.
        if (popped?.kind === 'object') {
          emitDuplicateKeys(popped.keys, makeDiagId, out);
        }
        break;
      }
      case 'rbracket':
        scopes.pop();
        break;
      case 'string': {
        const cur = scopes.at(-1);
        // A string is a key when it sits inside an object scope
        // immediately after `{` or `,` — i.e. in JSON's grammar
        // position `object = { (string : value (, string : value)*)? }`.
        if (
          cur?.kind === 'object' &&
          (prevNonError?.kind === 'lbrace' || prevNonError?.kind === 'comma')
        ) {
          const stringTok = t as Extract<JsonToken, { kind: 'string' }>;
          const existing = cur.keys.get(stringTok.value) ?? [];
          existing.push(stringTok.span);
          cur.keys.set(stringTok.value, existing);
        }
        break;
      }
      default:
        break;
    }

    if (t.kind !== 'error') {
      prevNonError = t;
    }
  }

  return out;
}

type Scope =
  | { readonly kind: 'object'; readonly keys: Map<string, JsonTokenSpan[]> }
  | { readonly kind: 'array' };

function emitDuplicateKeys(
  keys: ReadonlyMap<string, readonly JsonTokenSpan[]>,
  makeDiagId: () => string,
  out: Diagnostic[],
): void {
  for (const [keyName, spans] of keys) {
    if (spans.length < 2) continue;
    const first = spans[0]!;
    for (let i = 1; i < spans.length; i += 1) {
      const here = spans[i]!;
      out.push(
        makeDiagnostic(
          makeDiagId(),
          'warning',
          JSON_DIAGNOSTIC_CODES.duplicateKey,
          `duplicate object key "${keyName}" (first defined at line ${first.startLine}, column ${first.startColumn})`,
          here,
          'JSON.parse silently keeps the last value when an object has duplicate keys. Rename or remove the duplicate to make the intent explicit.',
        ),
      );
    }
  }
}
