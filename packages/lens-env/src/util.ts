/**
 * Same `Clock` + `makeIdFactory` shape as lens-binary and lens-json.
 *
 * This is the **second** occurrence of the pattern (lens-binary
 * originated it; lens-json was the first reuse). Per the open-core
 * reuse rule documented in NekoJSON's charter (docs/tools/nekojson.md
 * §7) and re-affirmed in NekoEnv's charter (docs/tools/nekoenv.md §7),
 * extraction into a shared package waits for the **third** occurrence.
 * The duplication is intentional and is the cheapest correct response
 * to "two examples is not enough yet."
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
