/**
 * Self-contained case-transform core: split a string into words (honoring
 * separators, camelCase humps, and letter/digit boundaries) and render it
 * in the common programming case styles. No deps, no network.
 */

/** Canonical list of supported case-form ids (also the column order in the UI). */
export const CASE_FORMS = [
  'lower',
  'upper',
  'title',
  'sentence',
  'camel',
  'pascal',
  'snake',
  'constant',
  'kebab',
  'dot',
  'slug',
] as const;

export type CaseFormId = (typeof CASE_FORMS)[number];

/** Split into lowercased word tokens. */
export function tokenize(input: string): string[] {
  return input
    // camelCase / PascalCase humps
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // ACRONYMWord → ACRONYM Word
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // letter/digit boundaries
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    // any remaining non-alphanumeric run is a separator
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w !== '')
    .map((w) => w.toLowerCase());
}

function cap(word: string): string {
  return word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1);
}

/** Render the given tokens in every supported case form. */
export function caseForms(words: readonly string[]): Record<CaseFormId, string> {
  const lower = words.join(' ');
  return {
    lower,
    upper: lower.toUpperCase(),
    title: words.map(cap).join(' '),
    sentence: words.length === 0 ? '' : cap(words[0]!) + (words.length > 1 ? ` ${words.slice(1).join(' ')}` : ''),
    camel: words.length === 0 ? '' : words[0]! + words.slice(1).map(cap).join(''),
    pascal: words.map(cap).join(''),
    snake: words.join('_'),
    constant: words.join('_').toUpperCase(),
    kebab: words.join('-'),
    dot: words.join('.'),
    slug: words.join('-'),
  };
}

/** Convenience: tokenize + render. */
export function transformCase(input: string): { words: string[]; forms: Record<CaseFormId, string> } {
  const words = tokenize(input);
  return { words, forms: caseForms(words) };
}
