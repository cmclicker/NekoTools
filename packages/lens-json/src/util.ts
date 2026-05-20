/**
 * Same shape as lens-binary's util.ts. Duplicated here intentionally
 * for Phase 1 — if a third lens needs it, the helpers are extracted to
 * a shared package in a follow-up. See `docs/tool-charter.md` rule 7
 * (reuse).
 */
export function makeIdFactory(prefix: string): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}_${n}`;
  };
}

export interface Clock {
  now(): string;
}

export const FIXED_CLOCK = (iso: string): Clock => ({ now: () => iso });
