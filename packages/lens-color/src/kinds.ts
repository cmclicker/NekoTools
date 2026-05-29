import type { Artifact } from '@nekotools/contracts';

import type { ColorFormat, Rgba } from './color.js';

/**
 * NekoColor artifact kinds (namespaced under `color.*`).
 *
 *   `color.parsed` — one or more colors (one per input line) decoded into
 *                    RGBA + normalized hex / rgb / hsl forms, with WCAG
 *                    relative luminance and contrast vs white/black. Pure
 *                    color math; no network.
 */
export const COLOR_KIND_PARSED = 'color.parsed';

export const ALL_COLOR_KINDS = [COLOR_KIND_PARSED] as const;

export interface ParsedColor {
  readonly input: string;
  readonly valid: boolean;
  readonly format: ColorFormat | null;
  readonly rgba: Rgba | null;
  readonly hex: string | null;
  readonly rgb: string | null;
  readonly hsl: string | null;
  readonly luminance: number | null;
  readonly contrastWhite: number | null;
  readonly contrastBlack: number | null;
}

/** The parsed body of a `color.parsed` artifact. */
export interface ColorReport {
  readonly count: number;
  readonly colors: readonly ParsedColor[];
}

export type ColorParsedArtifact = Artifact<'color.parsed', ColorReport>;
export type ColorArtifact = ColorParsedArtifact;

export const COLOR_PARSED_EXPORT_KINDS = [COLOR_KIND_PARSED] as const;
