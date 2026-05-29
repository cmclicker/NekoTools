/**
 * Self-contained MIME core: a common type↔extension table plus a parser for
 * Content-Type strings (essence, structured-syntax suffix, registration
 * tree, parameters) and bare extensions/filenames. No dependencies, no
 * network. The table is a curated common subset, not the full IANA registry.
 */

export const MIME_TABLE: Readonly<Record<string, readonly string[]>> = {
  'text/plain': ['txt'],
  'text/html': ['html', 'htm'],
  'text/css': ['css'],
  'text/csv': ['csv'],
  'text/markdown': ['md', 'markdown'],
  'application/json': ['json'],
  'application/ld+json': ['jsonld'],
  'application/xml': ['xml'],
  'application/yaml': ['yaml', 'yml'],
  'application/toml': ['toml'],
  'application/javascript': ['js', 'mjs'],
  'application/wasm': ['wasm'],
  'application/pdf': ['pdf'],
  'application/zip': ['zip'],
  'application/gzip': ['gz'],
  'application/x-tar': ['tar'],
  'application/octet-stream': ['bin'],
  'application/x-www-form-urlencoded': [],
  'multipart/form-data': [],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'image/svg+xml': ['svg'],
  'image/avif': ['avif'],
  'image/x-icon': ['ico'],
  'audio/mpeg': ['mp3'],
  'audio/wav': ['wav'],
  'audio/ogg': ['ogg', 'oga'],
  'video/mp4': ['mp4'],
  'video/webm': ['webm'],
  'font/woff': ['woff'],
  'font/woff2': ['woff2'],
  'font/ttf': ['ttf'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
};

/** ext → canonical type (first declared type wins). */
export const EXT_TO_TYPE: Readonly<Record<string, string>> = (() => {
  const map: Record<string, string> = {};
  for (const [type, exts] of Object.entries(MIME_TABLE)) {
    for (const ext of exts) if (!(ext in map)) map[ext] = type;
  }
  return map;
})();

export type RegistrationTree = 'standard' | 'vendor' | 'personal' | 'unregistered';

export interface MimeParam {
  readonly name: string;
  readonly value: string;
}

export interface ParsedMimeValue {
  readonly kind: 'content-type' | 'extension';
  readonly type: string;
  readonly subtype: string;
  /** Structured-syntax suffix (e.g. "xml" in `image/svg+xml`), or null. */
  readonly suffix: string | null;
  readonly tree: RegistrationTree;
  /** `type/subtype` lowercased, parameter-free. */
  readonly essence: string;
  readonly parameters: readonly MimeParam[];
  /** Known file extensions for this essence (may be empty). */
  readonly extensions: readonly string[];
  /** True when the essence is present in the built-in table. */
  readonly known: boolean;
}

function treeOf(subtype: string): RegistrationTree {
  if (subtype.startsWith('vnd.')) return 'vendor';
  if (subtype.startsWith('prs.')) return 'personal';
  if (subtype.startsWith('x-') || subtype.startsWith('x.')) return 'unregistered';
  return 'standard';
}

/** Parse a Content-Type string. Returns null if it has no `type/subtype`. */
export function parseContentType(input: string): ParsedMimeValue | null {
  const segments = input.split(';');
  const essenceRaw = (segments[0] ?? '').trim().toLowerCase();
  const slash = essenceRaw.indexOf('/');
  if (slash <= 0 || slash === essenceRaw.length - 1) return null;
  const type = essenceRaw.slice(0, slash);
  const subtype = essenceRaw.slice(slash + 1);
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(type) || !/^[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(subtype)) {
    return null;
  }

  const plus = subtype.lastIndexOf('+');
  const suffix = plus > 0 ? subtype.slice(plus + 1) : null;

  const parameters: MimeParam[] = [];
  for (const seg of segments.slice(1)) {
    const trimmed = seg.trim();
    if (trimmed === '') continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) {
      parameters.push({ name: trimmed.toLowerCase(), value: '' });
      continue;
    }
    const name = trimmed.slice(0, eq).trim().toLowerCase();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
    parameters.push({ name, value });
  }

  const essence = `${type}/${subtype}`;
  const extensions = MIME_TABLE[essence] ?? [];
  return {
    kind: 'content-type',
    type,
    subtype,
    suffix,
    tree: treeOf(subtype),
    essence,
    parameters,
    extensions,
    known: essence in MIME_TABLE,
  };
}

/** Resolve a bare extension or filename to its type. Returns null if unknown. */
export function parseExtension(input: string): ParsedMimeValue | null {
  const cleaned = input.trim().toLowerCase().replace(/^\*?\./, '');
  const ext = cleaned.includes('.') ? cleaned.slice(cleaned.lastIndexOf('.') + 1) : cleaned;
  const essence = EXT_TO_TYPE[ext];
  if (essence === undefined) return null;
  const slash = essence.indexOf('/');
  const subtype = essence.slice(slash + 1);
  const plus = subtype.lastIndexOf('+');
  return {
    kind: 'extension',
    type: essence.slice(0, slash),
    subtype,
    suffix: plus > 0 ? subtype.slice(plus + 1) : null,
    tree: treeOf(subtype),
    essence,
    parameters: [],
    extensions: MIME_TABLE[essence] ?? [],
    known: true,
  };
}

/** Parse a line as a Content-Type (if it contains `/`) or a bare extension. */
export function parseMime(input: string): ParsedMimeValue | null {
  const s = input.trim();
  if (s === '') return null;
  return s.includes('/') ? parseContentType(s) : parseExtension(s);
}
