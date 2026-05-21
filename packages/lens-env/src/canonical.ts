import type { EnvDocument, EnvEntry } from './kinds.js';

/**
 * Canonical re-emit of an `env.document`.
 *
 * `mode: 'sorted'` (used by the textual-diff parser) sorts entries by
 * key, double-quotes every value, drops comments and blank lines.
 * This gives a stable comparison form so reordered keys or quoting
 * differences do not produce diff noise.
 *
 * `mode: 'preserved'` (used by `env.export.env.canonical`) preserves
 * source order, comments, and blank lines, but normalizes quoting so
 * values with whitespace, `#`, or escape characters are safely
 * round-trippable. This is the human-facing canonical re-emit.
 */
export type CanonicalMode = 'sorted' | 'preserved';

export function canonicalize(doc: EnvDocument, mode: CanonicalMode): string {
  if (mode === 'sorted') return renderSorted(doc);
  return renderPreserved(doc);
}

function renderSorted(doc: EnvDocument): string {
  // Last-occurrence-wins for duplicates, matching dotenv loader
  // behavior. This is the same precedence rule env.key uses.
  const lastByKey = new Map<string, EnvEntry>();
  for (const e of doc.entries) {
    lastByKey.set(e.key, e);
  }
  const keys = [...lastByKey.keys()].sort();
  return keys.map((k) => `${k}=${quoteForCanonical(lastByKey.get(k)!.value)}`).join('\n');
}

function renderPreserved(doc: EnvDocument): string {
  // Use the line records so comments and blank lines round-trip.
  const out: string[] = [];
  for (const line of doc.lines) {
    if (line.kind === 'blank') {
      out.push('');
      continue;
    }
    if (line.kind === 'comment') {
      out.push(line.text === '' ? '#' : `# ${line.text}`);
      continue;
    }
    if (line.kind === 'malformed') {
      // Best-effort: keep the original text verbatim so users can
      // see + edit. The text parser already surfaced a diagnostic at
      // this line.
      out.push(line.text);
      continue;
    }
    // Entry line.
    const entry = doc.entries[line.entryIndex];
    if (!entry) continue;
    const valuePart = quoteForCanonical(entry.value);
    const prefix = entry.exportPrefix ? 'export ' : '';
    const trail = entry.trailingComment !== undefined ? ` # ${entry.trailingComment}` : '';
    out.push(`${prefix}${entry.key}=${valuePart}${trail}`);
  }
  return out.join('\n');
}

/**
 * Choose a safe quoting for a decoded value. Empty strings stay
 * unquoted (`KEY=`). Values that need escape characters or carry
 * whitespace, `#`, or quotes get double-quoted with `\n` / `\r` /
 * `\t` / `\"` / `\\` re-encoded. Everything else stays unquoted —
 * this keeps simple values readable in the canonical output.
 */
export function quoteForCanonical(value: string): string {
  if (value === '') return '';
  if (needsQuoting(value)) {
    return `"${encodeForDoubleQuoted(value)}"`;
  }
  return value;
}

function needsQuoting(value: string): boolean {
  return /[\s"'\\#$]/.test(value);
}

function encodeForDoubleQuoted(value: string): string {
  let out = '';
  for (const ch of value) {
    switch (ch) {
      case '\\':
        out += '\\\\';
        break;
      case '"':
        out += '\\"';
        break;
      case '\n':
        out += '\\n';
        break;
      case '\r':
        out += '\\r';
        break;
      case '\t':
        out += '\\t';
        break;
      default:
        out += ch;
    }
  }
  return out;
}

/**
 * `.env.example` skeleton: keys preserved, comments preserved,
 * values stripped (left empty so a fresh user fills them in).
 */
export function renderExample(doc: EnvDocument): string {
  const out: string[] = [];
  for (const line of doc.lines) {
    if (line.kind === 'blank') {
      out.push('');
      continue;
    }
    if (line.kind === 'comment') {
      out.push(line.text === '' ? '#' : `# ${line.text}`);
      continue;
    }
    if (line.kind === 'malformed') {
      out.push(line.text);
      continue;
    }
    const entry = doc.entries[line.entryIndex];
    if (!entry) continue;
    const prefix = entry.exportPrefix ? 'export ' : '';
    const trail = entry.trailingComment !== undefined ? ` # ${entry.trailingComment}` : '';
    out.push(`${prefix}${entry.key}=${trail}`);
  }
  return out.join('\n');
}
