import { toHex, type Rgba } from './color.js';
import type { ColorReport } from './kinds.js';

/**
 * NekoColor Pro generators. Back the declared Pro exporters
 * `color.export.palette` (pro entitlement `palette.generate`) and
 * `color.export.css-vars` (pro entitlement `export.css-vars`).
 *
 * Both are pure, deterministic functions of the parsed `color.parsed`
 * colors — no network, no clock, no premium engine. Palette generation is
 * a fixed tint/shade scale (RGB interpolation toward white/black at the
 * conventional 50–900 stops); the scale.generate / blend.mix / contrast-grid
 * / colorblind.simulate Pro features stay advertising-only.
 */

/** Conventional tint/shade stops (Tailwind-like); 500 is the base color. */
const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Linearly mix two channels by t (0 = a, 1 = b). */
function mixChannel(a: number, b: number, t: number): number {
  return clamp255(a + (b - a) * t);
}

/** Mix a base color toward a target (white/black) by fraction t. */
function mixToward(base: Rgba, target: Rgba, t: number): Rgba {
  return {
    r: mixChannel(base.r, target.r, t),
    g: mixChannel(base.g, target.g, t),
    b: mixChannel(base.b, target.b, t),
    a: base.a,
  };
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

/**
 * Generate a 50–900 tint/shade scale for a base color. Stops below 500 mix
 * toward white (tints), stops above 500 mix toward black (shades), 500 is
 * the base. Deterministic geometry — a usable starting palette, not a
 * perceptual-uniform scale (that is the advertising-only `scale.generate`).
 */
export function generateScale(base: Rgba): { readonly stop: number; readonly hex: string }[] {
  return STOPS.map((stop) => {
    if (stop === 500) return { stop, hex: toHex(base) };
    if (stop < 500) {
      // 50 → near white, 400 → near base.
      const t = (500 - stop) / 500; // 0.9 … 0.2
      return { stop, hex: toHex(mixToward(base, WHITE, t)) };
    }
    // 600 → slightly dark, 900 → near black.
    const t = (stop - 500) / 500; // 0.2 … 0.8
    return { stop, hex: toHex(mixToward(base, BLACK, t)) };
  });
}

/** A valid color reduced to the fields the generators need (rgba non-null). */
interface ResolvedColor {
  readonly hex: string;
  readonly rgba: Rgba;
}

/** Valid parsed colors that carry an RGBA value, in input order. */
function validColors(report: ColorReport): ResolvedColor[] {
  const out: ResolvedColor[] = [];
  for (const c of report.colors) {
    if (c.valid && c.rgba !== null) out.push({ hex: c.hex ?? toHex(c.rgba), rgba: c.rgba });
  }
  return out;
}

// --- palette ---------------------------------------------------------------

/**
 * `color.export.palette` — a markdown tint/shade palette: for each valid
 * input color, a 50–900 scale table. Multiple inputs each get their own
 * scale block.
 */
export function toPalette(report: ColorReport): string {
  const colors = validColors(report);
  const out: string[] = ['# NekoColor palette', ''];
  if (colors.length === 0) {
    out.push('(no valid colors)');
    return out.join('\n');
  }
  colors.forEach((c, i) => {
    out.push(`## Color ${i + 1} — \`${c.hex}\``, '', '| stop | hex |', '| --- | --- |');
    for (const s of generateScale(c.rgba)) out.push(`| ${s.stop} | \`${s.hex}\` |`);
    out.push('');
  });
  return out.join('\n');
}

// --- css-vars --------------------------------------------------------------

/**
 * `color.export.css-vars` — CSS custom properties under `:root`. A single
 * input emits one `--color-<stop>` scale; multiple inputs are namespaced
 * `--color-<n>-<stop>`. Ready to paste into a stylesheet.
 */
export function toCssVars(report: ColorReport): string {
  const colors = validColors(report);
  const lines: string[] = [':root {'];
  if (colors.length === 0) {
    lines.push('}');
    return lines.join('\n');
  }
  const single = colors.length === 1;
  colors.forEach((c, i) => {
    const prefix = single ? '--color' : `--color-${i + 1}`;
    for (const s of generateScale(c.rgba)) lines.push(`  ${prefix}-${s.stop}: ${s.hex};`);
  });
  lines.push('}');
  return lines.join('\n');
}
