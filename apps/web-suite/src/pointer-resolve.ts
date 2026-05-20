import { parsePointer } from '@nekotools/lens-json';

/**
 * Phase 1.1h pointer resolver.
 *
 * The lens-json `json.pointer` parser already implements RFC 6901
 * pointer parsing and resolution against a document, but it does so
 * through the runtime registry and emits a `json.path-result`
 * artifact. For Copy-value, we don't need the artifact — we just need
 * the resolved value (or a clean "unresolved" signal). This helper
 * reuses `parsePointer` from lens-json for the tokenization step and
 * does the final walk in-place.
 *
 * Reusing `parsePointer` keeps the RFC 6901 token-escape rules
 * (`~0` → `~`, `~1` → `/`) in exactly one place across the workspace.
 */
export type ResolveResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly reason: string };

export function resolveJsonPointer(root: unknown, pointer: string): ResolveResult {
  const parsed = parsePointer(pointer);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.error };
  }

  let current: unknown = root;
  for (const token of parsed.tokens) {
    if (current === null || current === undefined) {
      return { ok: false, reason: `cannot descend into null/undefined at "${token}"` };
    }
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(token)) {
        return {
          ok: false,
          reason: `array requires non-negative integer index, got "${token}"`,
        };
      }
      const idx = Number(token);
      if (idx >= current.length) {
        return { ok: false, reason: `array index ${idx} out of bounds` };
      }
      current = current[idx];
      continue;
    }
    if (typeof current === 'object') {
      const obj = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(obj, token)) {
        return { ok: false, reason: `key "${token}" not found` };
      }
      current = obj[token];
      continue;
    }
    return { ok: false, reason: `cannot descend into ${typeof current} at "${token}"` };
  }
  return { ok: true, value: current };
}
