/**
 * Bundled IANA media-type subset (Pro). A curated, static table of common
 * media types backing the `mime.export.iana-lookup` Pro exporter. This is NOT
 * the full IANA registry — the manifest's `outOfScope` explicitly sanctions
 * shipping "a common subset" here. The thesis forbids runtime *fetch*, not a
 * static bundled table, so this is a plain `const` object: no network, no
 * clock, no dependencies, fully deterministic.
 *
 * Each entry maps a media-type essence (`type/subtype`, lowercased) to its
 * canonical name, the file extensions associated with it, and a coarse
 * category. A handful of well-documented deprecated aliases carry
 * `deprecatedAliasOf` pointing at the preferred canonical type:
 *
 *   - `application/javascript` is obsoleted by `text/javascript` (RFC 9239).
 *   - `text/xml` defers to `application/xml` as the preferred form (RFC 7303).
 *
 * The richer `category` / `canonical` / `deprecatedAliasOf` metadata is what
 * distinguishes this Pro table from the free engine's bare `MIME_TABLE`
 * (essence → extensions) in `./mime.js`.
 */

/** Coarse top-level grouping for a media type. */
export type IanaCategory = 'text' | 'image' | 'application' | 'audio' | 'video' | 'font' | 'multipart';

export interface IanaTypeInfo {
  /** Preferred canonical media type. Equals the key unless deprecated. */
  readonly canonical: string;
  /** File extensions associated with this type (may be empty). */
  readonly extensions: readonly string[];
  /** Coarse category derived from the registry tree / top-level type. */
  readonly category: IanaCategory;
  /** Set when this essence is a deprecated alias of another canonical type. */
  readonly deprecatedAliasOf?: string;
}

/**
 * Curated common-subset table. Keyed by lowercased `type/subtype` essence.
 * Kept a plain literal so it is statically analyzable and never fetched.
 */
export const IANA_TYPES: Readonly<Record<string, IanaTypeInfo>> = {
  // --- text ---------------------------------------------------------------
  'text/plain': { canonical: 'text/plain', extensions: ['txt'], category: 'text' },
  'text/html': { canonical: 'text/html', extensions: ['html', 'htm'], category: 'text' },
  'text/css': { canonical: 'text/css', extensions: ['css'], category: 'text' },
  'text/csv': { canonical: 'text/csv', extensions: ['csv'], category: 'text' },
  'text/markdown': { canonical: 'text/markdown', extensions: ['md', 'markdown'], category: 'text' },
  'text/javascript': { canonical: 'text/javascript', extensions: ['js', 'mjs'], category: 'text' },
  'text/xml': {
    canonical: 'application/xml',
    extensions: ['xml'],
    category: 'text',
    deprecatedAliasOf: 'application/xml',
  },
  'text/calendar': { canonical: 'text/calendar', extensions: ['ics'], category: 'text' },
  'text/yaml': { canonical: 'text/yaml', extensions: ['yaml', 'yml'], category: 'text' },

  // --- application --------------------------------------------------------
  'application/json': { canonical: 'application/json', extensions: ['json'], category: 'application' },
  'application/ld+json': { canonical: 'application/ld+json', extensions: ['jsonld'], category: 'application' },
  'application/xml': { canonical: 'application/xml', extensions: ['xml'], category: 'application' },
  'application/yaml': { canonical: 'application/yaml', extensions: ['yaml', 'yml'], category: 'application' },
  'application/toml': { canonical: 'application/toml', extensions: ['toml'], category: 'application' },
  'application/javascript': {
    canonical: 'text/javascript',
    extensions: ['js', 'mjs'],
    category: 'application',
    deprecatedAliasOf: 'text/javascript',
  },
  'application/wasm': { canonical: 'application/wasm', extensions: ['wasm'], category: 'application' },
  'application/pdf': { canonical: 'application/pdf', extensions: ['pdf'], category: 'application' },
  'application/zip': { canonical: 'application/zip', extensions: ['zip'], category: 'application' },
  'application/gzip': { canonical: 'application/gzip', extensions: ['gz'], category: 'application' },
  'application/x-tar': { canonical: 'application/x-tar', extensions: ['tar'], category: 'application' },
  'application/octet-stream': { canonical: 'application/octet-stream', extensions: ['bin'], category: 'application' },
  'application/x-www-form-urlencoded': {
    canonical: 'application/x-www-form-urlencoded',
    extensions: [],
    category: 'application',
  },
  'application/sql': { canonical: 'application/sql', extensions: ['sql'], category: 'application' },
  'application/vnd.api+json': { canonical: 'application/vnd.api+json', extensions: [], category: 'application' },
  'application/manifest+json': {
    canonical: 'application/manifest+json',
    extensions: ['webmanifest'],
    category: 'application',
  },
  'application/rtf': { canonical: 'application/rtf', extensions: ['rtf'], category: 'application' },
  'application/vnd.ms-excel': { canonical: 'application/vnd.ms-excel', extensions: ['xls'], category: 'application' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    canonical: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['xlsx'],
    category: 'application',
  },
  'application/msword': { canonical: 'application/msword', extensions: ['doc'], category: 'application' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    canonical: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['docx'],
    category: 'application',
  },

  // --- image --------------------------------------------------------------
  'image/png': { canonical: 'image/png', extensions: ['png'], category: 'image' },
  'image/jpeg': { canonical: 'image/jpeg', extensions: ['jpg', 'jpeg'], category: 'image' },
  'image/gif': { canonical: 'image/gif', extensions: ['gif'], category: 'image' },
  'image/webp': { canonical: 'image/webp', extensions: ['webp'], category: 'image' },
  'image/svg+xml': { canonical: 'image/svg+xml', extensions: ['svg'], category: 'image' },
  'image/avif': { canonical: 'image/avif', extensions: ['avif'], category: 'image' },
  'image/x-icon': { canonical: 'image/x-icon', extensions: ['ico'], category: 'image' },
  'image/tiff': { canonical: 'image/tiff', extensions: ['tif', 'tiff'], category: 'image' },
  'image/bmp': { canonical: 'image/bmp', extensions: ['bmp'], category: 'image' },

  // --- audio --------------------------------------------------------------
  'audio/mpeg': { canonical: 'audio/mpeg', extensions: ['mp3'], category: 'audio' },
  'audio/wav': { canonical: 'audio/wav', extensions: ['wav'], category: 'audio' },
  'audio/ogg': { canonical: 'audio/ogg', extensions: ['ogg', 'oga'], category: 'audio' },
  'audio/aac': { canonical: 'audio/aac', extensions: ['aac'], category: 'audio' },
  'audio/flac': { canonical: 'audio/flac', extensions: ['flac'], category: 'audio' },

  // --- video --------------------------------------------------------------
  'video/mp4': { canonical: 'video/mp4', extensions: ['mp4'], category: 'video' },
  'video/webm': { canonical: 'video/webm', extensions: ['webm'], category: 'video' },
  'video/mpeg': { canonical: 'video/mpeg', extensions: ['mpeg', 'mpg'], category: 'video' },
  'video/quicktime': { canonical: 'video/quicktime', extensions: ['mov'], category: 'video' },

  // --- font ---------------------------------------------------------------
  'font/woff': { canonical: 'font/woff', extensions: ['woff'], category: 'font' },
  'font/woff2': { canonical: 'font/woff2', extensions: ['woff2'], category: 'font' },
  'font/ttf': { canonical: 'font/ttf', extensions: ['ttf'], category: 'font' },
  'font/otf': { canonical: 'font/otf', extensions: ['otf'], category: 'font' },

  // --- multipart ----------------------------------------------------------
  'multipart/form-data': { canonical: 'multipart/form-data', extensions: [], category: 'multipart' },
  'multipart/mixed': { canonical: 'multipart/mixed', extensions: [], category: 'multipart' },
};

/** Look an essence (`type/subtype`, any case) up in the bundled subset. */
export function lookupIana(essence: string): IanaTypeInfo | undefined {
  return IANA_TYPES[essence.toLowerCase()];
}
