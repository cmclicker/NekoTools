/**
 * Self-contained color core: parse hex / rgb() / hsl() / CSS named colors,
 * convert between forms, and compute WCAG relative luminance + contrast.
 * No dependencies, no network.
 */

export interface Rgba {
  readonly r: number; // 0-255
  readonly g: number; // 0-255
  readonly b: number; // 0-255
  readonly a: number; // 0-1
}

export type ColorFormat = 'hex' | 'rgb' | 'hsl' | 'named';

export interface ParsedColorValue {
  readonly rgba: Rgba;
  readonly format: ColorFormat;
}

export const NAMED_COLORS: Readonly<Record<string, string>> = {
  black: '000000', silver: 'c0c0c0', gray: '808080', grey: '808080', white: 'ffffff',
  maroon: '800000', red: 'ff0000', purple: '800080', fuchsia: 'ff00ff', magenta: 'ff00ff',
  green: '008000', lime: '00ff00', olive: '808000', yellow: 'ffff00', navy: '000080',
  blue: '0000ff', teal: '008080', aqua: '00ffff', cyan: '00ffff', orange: 'ffa500',
  pink: 'ffc0cb', gold: 'ffd700', indigo: '4b0082', violet: 'ee82ee', transparent: '00000000',
};

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const r2 = (n: number): number => Math.round(n * 100) / 100;

export function parseColor(input: string): ParsedColorValue | null {
  const s = input.trim();
  if (s === '') return null;
  if (s.startsWith('#')) return parseHex(s.slice(1));
  if (/^rgba?\(/i.test(s)) return parseRgbFunc(s);
  if (/^hsla?\(/i.test(s)) return parseHslFunc(s);
  const named = NAMED_COLORS[s.toLowerCase()];
  if (named !== undefined) {
    const rgba = parseHex(named)?.rgba;
    return rgba ? { rgba, format: 'named' } : null;
  }
  return null;
}

function parseHex(hex: string): ParsedColorValue | null {
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  let r: number;
  let g: number;
  let b: number;
  let a = 1;
  if (hex.length === 3 || hex.length === 4) {
    r = parseInt(hex[0]! + hex[0]!, 16);
    g = parseInt(hex[1]! + hex[1]!, 16);
    b = parseInt(hex[2]! + hex[2]!, 16);
    if (hex.length === 4) a = parseInt(hex[3]! + hex[3]!, 16) / 255;
  } else if (hex.length === 6 || hex.length === 8) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
    if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16) / 255;
  } else {
    return null;
  }
  return { rgba: { r, g, b, a: r2(a) }, format: 'hex' };
}

function fields(inside: string): string[] {
  return inside
    .replace(/\//g, ' ')
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t !== '');
}

function channel(token: string): number {
  if (token.endsWith('%')) return clamp((parseFloat(token) / 100) * 255, 0, 255);
  return clamp(parseFloat(token), 0, 255);
}

function alpha(token: string | undefined): number {
  if (token === undefined) return 1;
  if (token.endsWith('%')) return clamp(parseFloat(token) / 100, 0, 1);
  return clamp(parseFloat(token), 0, 1);
}

function parseRgbFunc(s: string): ParsedColorValue | null {
  const m = /^rgba?\(([^)]*)\)$/i.exec(s);
  if (m === null) return null;
  const parts = fields(m[1]!);
  if (parts.length < 3) return null;
  const r = Math.round(channel(parts[0]!));
  const g = Math.round(channel(parts[1]!));
  const b = Math.round(channel(parts[2]!));
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { rgba: { r, g, b, a: r2(alpha(parts[3])) }, format: 'rgb' };
}

function parseHslFunc(s: string): ParsedColorValue | null {
  const m = /^hsla?\(([^)]*)\)$/i.exec(s);
  if (m === null) return null;
  const parts = fields(m[1]!);
  if (parts.length < 3) return null;
  const h = ((parseFloat(parts[0]!) % 360) + 360) % 360;
  const sl = clamp(parseFloat(parts[1]!) / 100, 0, 1);
  const l = clamp(parseFloat(parts[2]!) / 100, 0, 1);
  if ([h, sl, l].some((n) => Number.isNaN(n))) return null;
  const { r, g, b } = hslToRgb(h, sl, l);
  return { rgba: { r, g, b, a: r2(alpha(parts[3])) }, format: 'hsl' };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return {
    r: Math.round((rp + mm) * 255),
    g: Math.round((gp + mm) * 255),
    b: Math.round((bp + mm) * 255),
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

const hex2 = (n: number): string => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');

export function toHex(c: Rgba): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return c.a < 1 ? `${base}${hex2(c.a * 255)}` : base;
}

export function toRgbString(c: Rgba): string {
  return c.a < 1 ? `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})` : `rgb(${c.r}, ${c.g}, ${c.b})`;
}

export function toHslString(c: Rgba): string {
  const { h, s, l } = rgbToHsl(c.r, c.g, c.b);
  return c.a < 1 ? `hsla(${h}, ${s}%, ${l}%, ${c.a})` : `hsl(${h}, ${s}%, ${l}%)`;
}

function linear(channel8: number): number {
  const cs = channel8 / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(c: Rgba): number {
  return r2(0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b));
}

export function contrastRatio(l1: number, l2: number): number {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return r2((hi + 0.05) / (lo + 0.05));
}
