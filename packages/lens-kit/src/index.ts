/**
 * `@nekotools/lens-kit` — the shared lens micro-utilities.
 *
 * This package exists because the `Clock` + `FIXED_CLOCK` +
 * `makeIdFactory` trio was duplicated across `lens-binary` (origin),
 * `lens-json` (1st reuse), and `lens-env` (2nd reuse). NekoLogs is the
 * 3rd reuse, which crosses the "duplicated more than twice across
 * tools, it is extracted in a follow-up PR" rule from NekoJSON's
 * charter (docs/tools/nekojson.md §7). This is that follow-up.
 *
 * Scope is deliberately tiny: only the helpers that were *actually*
 * duplicated three-plus times move here. Binary-specific helpers
 * (`bytesToHex` / `hexToBytes`) stay in `lens-binary` because they are
 * not shared. The kit does not grow speculatively — a new helper joins
 * only when it, too, has been duplicated past the same threshold.
 */

/**
 * A frozen timestamp supplied by the caller (the runtime). Lenses must
 * never call `new Date()` inside a parser/exporter — that makes outputs
 * change between runs and breaks reproducible exports. The runtime
 * passes a `Clock`; tests pass a `FIXED_CLOCK`.
 */
export interface Clock {
  now(): string;
}

/** A `Clock` that always returns the same ISO timestamp. */
export const FIXED_CLOCK = (iso: string): Clock => ({ now: () => iso });

/**
 * Deterministic, monotonic id generator. Lenses do not use random or
 * time-based ids at module scope because that makes tests fragile and
 * exports non-reproducible. Each parse/export call gets a fresh counter
 * via `makeIdFactory()`.
 */
export function makeIdFactory(prefix: string): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}_${n}`;
  };
}
